import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import type { AuthenticatedRequest } from '../http/auth-middleware';
import { canAccessAdminPanel } from '../rbac/policies';
import { audit } from '../audit/audit-log';
import { deleteBoardMembership } from '../db/admin-repositories';
import { getUserById } from '../db/repositories';
import { createServiceIdentity, serviceAdminResources, setServiceAdminResources } from '../db/service-identities';
import { canAccessBoard, canEditBoardCards } from '../rbac/permissions';
import { actionCatalog, permitsAction, resourceCatalog, verifyActions } from './actions';
import { ApiAuthorizationError, keySchema, serviceAssignmentsSchema } from './contract';
import { createGrant, isWithinResources, issueToken, readGrant, revokeGrant, serviceAccountContext, userContext } from './credentials';
import { rateLimit } from './rate-limit';

interface Account { id:string; name:string; owner_user_id:string; resources_json:string; actions_json:string; grant_id:string|null }
const transferSchema = z.object({ username:z.string().trim().min(1).max(100), confirmation:z.literal('TRANSFER') }).strict();

export function serviceAccountRoutes(db: Database.Database) {
  const router=Router();
  const find=(id:string, owner:string)=>db.prepare('SELECT * FROM api_service_accounts WHERE id=? AND owner_user_id=?').get(id,owner) as Account|undefined;
  function publicAccount(account:Account) {
    const grant = account.grant_id ? readGrant(db,account.grant_id) : null;
    return { id:account.id,name:account.name,username:getUserById(db,account.id)!.username,ownerUserId:account.owner_user_id,
      assignments:serviceAdminResources(db,account.id),resources:JSON.parse(account.resources_json) as string[], actions:JSON.parse(account.actions_json) as string[], key:grant ? { expiresAt:grant.expiresAt,lastUsedAt:grant.lastUsedAt,revokedAt:grant.revokedAt } : null };
  }
  function retire(account:Account, reason:string) {
    const grant=account.grant_id ? readGrant(db,account.grant_id) : null;
    if (grant) revokeGrant(db,grant,reason,account.owner_user_id);
  }
  router.use((request:AuthenticatedRequest,response,next)=>{
    if (!canAccessAdminPanel(request.auth!)) { response.status(403).json({ code:'GRANT_FORBIDDEN',message:'Administrator access required.' }); return; }
    next();
  });
  router.get('/',(request:AuthenticatedRequest,response)=>{
    const rows=db.prepare('SELECT * FROM api_service_accounts WHERE owner_user_id=? ORDER BY name LIMIT 100').all(request.auth!.user.id) as Account[];
    response.json({ items:rows.map(publicAccount) });
  });
  router.post(['/', '/:id/key'],rateLimit(db,'service-key-create',10),(request:AuthenticatedRequest,response)=>{
    const parsed=keySchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message:'Choose a name, resources, permissions and expiration.' }); return; }
    const actor=request.auth!;
    const id=String(request.params.id ?? randomUUID());
    const existing=request.params.id ? find(id,actor.user.id) : null;
    if (request.params.id && !existing) { response.status(404).json({ message:'Service account unavailable.' }); return; }
    try {
      const result=db.transaction(()=>{
        const {name,actions,resources,expiresInDays}=parsed.data;
        if (!existing) {
          verifyActions(db,actor,actions,resources,true);
          if (Number(db.prepare('SELECT COUNT(*) FROM api_service_accounts WHERE owner_user_id=?').pluck().get(actor.user.id)) >= 100) throw new ApiAuthorizationError(409,'ACCOUNT_LIMIT','Service account limit reached.');
          const now=new Date().toISOString();
          if (!db.prepare('INSERT INTO api_service_accounts (id,name,owner_user_id,resources_json,actions_json,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(name) DO NOTHING').run(id,name,actor.user.id,JSON.stringify(resources),JSON.stringify(actions),now).changes) {
            throw new ApiAuthorizationError(409,'NAME_UNAVAILABLE','Choose a different service account name.');
          }
          createServiceIdentity(db,id,name,now);
          setServiceAdminResources(db,id,resources,actor.user.id,now);
        } else retire(existing,'service_account_key_replaced');
        const identity=serviceAccountContext(db,id);
        if(!identity)throw new ApiAuthorizationError(403,'GRANT_FORBIDDEN','Service account access is unavailable.');
        const scopes=verifyActions(db,identity,actions,resources,true,true);
        const grant=createGrant(db,identity,{name:existing?.name ?? name,scopes,resources,expiresInDays},'pat',null,undefined,actions,id);
        const token=issueToken(db,grant,'pat');
        db.prepare('UPDATE api_service_accounts SET grant_id=?,resources_json=?,actions_json=? WHERE id=?').run(grant.id,JSON.stringify(resources),JSON.stringify(actions),id);
        audit(db,{actorUserId:actor.user.id,scopeType:'auth',action:existing?'api.service_account.key_replace':'api.service_account.create',outcome:'success',metadata:{serviceAccountId:id,serviceAccountName:grant.name}});
        return { account:publicAccount(find(id,actor.user.id)!),token:token.raw };
      })();
      response.status(201).json(result);
    } catch (error) {
      if (error instanceof ApiAuthorizationError) { response.status(error.status).json({code:error.code,message:error.message}); return; }
      throw error;
    }
  });
  router.put('/:id/assignments',rateLimit(db,'service-account-assignments',10),(request:AuthenticatedRequest,response)=>{
    const parsed=serviceAssignmentsSchema.safeParse(request.body);
    if(!parsed.success){response.status(400).json({message:'Choose valid service account assignments.'});return;}
    const actor=request.auth!;
    const account=find(String(request.params.id),actor.user.id);
    if(!account){response.status(404).json({message:'Service account unavailable.'});return;}
    const {resources}=parsed.data;
    const allowed=new Set(resourceCatalog(db,actor,true).map(item=>item.id));
    if(resources.some(item=>!allowed.has(item))||resources.includes('platform')&&resources.length>1){response.status(403).json({message:'Some resources are outside your administrative access.'});return;}
    const previous=serviceAdminResources(db,account.id);
    if(previous.length===resources.length&&previous.every(item=>resources.includes(item))){response.json({account:publicAccount(account)});return;}
    db.transaction(()=>{
      retire(account,'service_account_assignments_changed');
      for(const item of previous.filter(item=>item.startsWith('board:')&&!resources.includes(item))){
        const boardId=item.slice(6);
        if(db.prepare('SELECT 1 FROM board_memberships WHERE id=?').get(`service-default:${account.id}:${boardId}`))deleteBoardMembership(db,actor.user,boardId,account.id);
      }
      setServiceAdminResources(db,account.id,resources,actor.user.id,new Date().toISOString());
      audit(db,{actorUserId:actor.user.id,targetUserId:account.id,scopeType:'auth',action:'api.service_account.assignments_update',outcome:'success',metadata:{resources}});
    })();
    response.json({account:publicAccount(account)});
  });
  router.delete('/:id/key',(request:AuthenticatedRequest,response)=>{
    const account=find(String(request.params.id),request.auth!.user.id);
    if (!account) { response.status(404).json({ message:'Service account unavailable.' }); return; }
    db.transaction(()=>retire(account,'service_account_key_revoked'))();
    response.status(204).end();
  });
  router.post('/:id/transfer',rateLimit(db,'service-account-transfer',10),(request:AuthenticatedRequest,response)=>{
    const parsed=transferSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message:'Enter the new owner’s username and confirm the transfer.' }); return; }
    const actor=request.auth!;
    const account=find(String(request.params.id),actor.user.id);
    if (!account) { response.status(404).json({ message:'Service account unavailable.' }); return; }
    const targetId=db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND is_service_account=0').pluck().get(parsed.data.username);
    const target=typeof targetId==='string' && targetId!==actor.user.id ? userContext(db,targetId) : null;
    if (!target || !canAccessAdminPanel(target)) { response.status(400).json({ message:'Choose another active administrator.' }); return; }
    const old=publicAccount(account);
    const narrow=(input:string[])=>{
      const eligible=resourceCatalog(db,target,true).filter(item=>input.includes(item.id) || input.includes('platform') || item.id.startsWith('board:') && isWithinResources(db,input,'board',item.id.slice(6)));
      return (eligible.some(item=>item.id==='platform') ? eligible.filter(item=>item.id==='platform') : eligible.filter(item=>item.id.startsWith('workspace:') || !eligible.some(workspace=>workspace.id.startsWith('workspace:') && isWithinResources(db,[workspace.id],'board',item.id.slice(6))))).slice(0,100);
    };
    const resources=narrow(old.resources);
    const assignments=narrow(old.assignments).map(item=>item.id);
    const actions=actionCatalog().filter(action=>old.actions.includes(action.id) && resources.length && resources.every(resource=>permitsAction(resource,action))).map(action=>action.id);
    db.transaction(()=>{
      retire(account,'service_account_transferred');
      const memberships=db.prepare('SELECT board_id FROM board_memberships WHERE user_id=?').pluck().all(account.id) as string[];
      for(const boardId of memberships){
        if(!canAccessBoard(db,target,boardId))deleteBoardMembership(db,actor.user,boardId,account.id);
        else if(!canEditBoardCards(db,target,boardId))db.prepare("UPDATE board_memberships SET role='observer' WHERE user_id=? AND board_id=?").run(account.id,boardId);
      }
      setServiceAdminResources(db,account.id,assignments,target.user.id,new Date().toISOString());
      db.prepare('UPDATE api_service_accounts SET owner_user_id=?,resources_json=?,actions_json=?,grant_id=NULL WHERE id=?').run(target.user.id,JSON.stringify(resources.map(item=>item.id)),JSON.stringify(actions),account.id);
      audit(db,{actorUserId:actor.user.id,targetUserId:target.user.id,scopeType:'auth',action:'api.service_account.transfer',outcome:'success',metadata:{serviceAccountId:account.id,serviceAccountName:account.name}});
    })();
    response.status(204).end();
  });
  return router;
}
