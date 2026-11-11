import { createOAuthConsentRoutes } from './oauth-routes';
import { Router } from 'express';
import type Database from 'better-sqlite3';
import { requireContentAuth, safeContentErrors, type AuthenticatedRequest } from '../http/auth-middleware';
import { createGrant, issueToken, readGrant, revokeGrant, serviceAccountContext } from './credentials';
import { grantSchema, keySchema, KEY_EXPIRIES, ApiAuthorizationError } from './contract';
import { ACCESS_LEVELS, actionCatalog, permitsAction, resourceCatalog, verifyActions } from './actions';
import { serviceAccountRoutes } from './service-accounts';
import { rateLimit, requireTls } from './rate-limit';

export function createConnectionRoutes(db: Database.Database) {
  const router = Router();
  router.use(requireTls, requireContentAuth);
  router.use((request: AuthenticatedRequest, response, next) => {
    if (request.get('Authorization') || request.auth?.credential) { response.status(403).json({ code: 'BROWSER_APPROVAL_REQUIRED', message: 'Manage connections in your browser account.' }); return; }
    if (!['GET','HEAD'].includes(request.method) && (request.get('X-Strata-Intent') !== 'connections' || (request.get('Origin') && request.get('Origin') !== `${request.protocol}://${request.get('host')}`))) {
      response.status(403).json({ code: 'BROWSER_APPROVAL_REQUIRED', message: 'Submit this action from your Strata account.' }); return;
    }
    next();
  });
  router.use(createOAuthConsentRoutes(db));
  router.use('/service-accounts', serviceAccountRoutes(db));
  router.get('/catalog', (request: AuthenticatedRequest, response) => {
    const serviceId=request.query.serviceAccount;
    const actor=request.auth!;
    const service=request.query.service==='1'||serviceId!==undefined;
    const identity=serviceId===undefined?actor:typeof serviceId==='string'&&db.prepare('SELECT 1 FROM api_service_accounts WHERE id=? AND owner_user_id=?').get(serviceId,actor.user.id)?serviceAccountContext(db,serviceId):null;
    if(!identity){response.status(404).json({message:'Service account unavailable.'});return;}
    const actions = actionCatalog().filter(item => !service || !item.personal);
    const resources = resourceCatalog(db,identity,service,serviceId!==undefined).map(resource => ({
      id:resource.id,label:resource.label,actions:actions.filter(item=>permitsAction(resource,item)).map(item=>item.id),
    }));
    response.json({ resources, actions:actions.map(({id,label,level})=>({id,label,level})), levels:ACCESS_LEVELS, expiries:KEY_EXPIRIES });
  });
  router.get('/', (request: AuthenticatedRequest, response) => {
    const ids = db.prepare("SELECT id FROM api_grants WHERE user_id = ? AND service_account_id IS NULL ORDER BY (revoked_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')) DESC, created_at DESC, id LIMIT 200").all(request.auth!.user.id) as { id: string }[];
    const items = ids.map(({ id }) => { const grant = readGrant(db, id)!; const { authority, ...safe } = grant; void authority; return safe; });
    response.json({ items });
  });
  router.post('/', rateLimit(db, 'pat-create', 10), (request: AuthenticatedRequest, response) => {
    const detailed = keySchema.safeParse(request.body);
    const legacy = grantSchema.safeParse(request.body);
    if (!detailed.success && !legacy.success) { response.status(400).json({ code: 'INPUT_INVALID', message: 'Choose a name, valid permissions, resources, expiry and confirmation.' }); return; }
    try {
      const result = db.transaction(() => {
        const actor = request.auth!;
        const grant = detailed.success
          ? createGrant(db,actor,{...detailed.data,scopes:verifyActions(db,actor,detailed.data.actions,detailed.data.resources,false)},'pat',null,undefined,detailed.data.actions)
          : createGrant(db,actor,legacy.data!,'pat');
        const token = issueToken(db, grant, 'pat');
        const { authority, ...connection } = grant; void authority;
        return { connection, token: token.raw };
      })();
      response.status(201).json(result);
    } catch (error) {
      if (error instanceof ApiAuthorizationError) { response.status(error.status).json({ code: error.code, message: error.message }); return; }
      throw error;
    }
  });
  router.delete('/:id', (request: AuthenticatedRequest, response) => {
    const grant = readGrant(db, String(request.params.id));
    if (!grant || grant.serviceAccountId || grant.userId !== request.auth!.user.id) { response.status(404).json({ code: 'CONNECTION_UNAVAILABLE', message: 'Connection unavailable.' }); return; }
    db.transaction(() => revokeGrant(db, grant, 'user_revocation'))();
    response.status(204).send();
  });
  router.use(safeContentErrors);
  return router;
}
