// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createDatabase, type DatabaseHandle } from '../src/db/database';
import { createApp } from '../src/app';

describe('credential security boundaries', () => {
  let db: DatabaseHandle;
  let app: ReturnType<typeof createApp>;
  beforeEach(async () => { process.env.SEED_DATA = 'true'; db = await createDatabase(':memory:'); app = createApp(db); });
  afterEach(() => db.close());
  async function issue(username: string, password: string, scopes: string[], resources: string[]) {
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ username, password })).status).toBe(200);
    const result = await agent.post('/api/connections').set('X-Strata-Intent','connections').send({ name:'Security test', scopes, resources, expiresInDays:7, confirmation:'CREATE' });
    return { agent, result, authorization:`Bearer ${result.body.token}` };
  }
  it('supports account-only access and keeps it separate from content and credential approval', async () => {
    const { agent, result, authorization } = await issue('priya','Member12345!',['account:read','account:write'],['account']);
    expect(result.status).toBe(201);
    const own = await request(app).get('/api/v1/me').set('Authorization',authorization);
    expect(own.status).toBe(200);
    expect(own.body.user.id).toBe('u3');
    expect(own.body.appState).toBeUndefined();
    expect((await request(app).get('/api/v1/cards').set('Authorization',authorization)).status).toBe(403);
    expect((await agent.get('/api/connections').set('Authorization',authorization)).status).toBe(403);
    expect((await agent.patch('/api/auth/profile').set('Authorization',authorization).send({name:'Bypass',initials:'B',color:'#ffffff'})).status).toBe(401);
  });
  it('rechecks live roles and membership and never expands a credential after promotion', async () => {
    const member = await issue('priya','Member12345!',['content:read','content:write'],['board:b1']);
    expect(member.result.status).toBe(201);
    const create = () => request(app).post('/api/v1/cards').set('Authorization',member.authorization).send({ boardId:'b1',listId:'l1',title:'Member write' });
    expect((await create()).status).toBe(201);
    db.prepare("UPDATE board_memberships SET role = 'observer' WHERE user_id = 'u3' AND board_id = 'b1'").run();
    expect((await create()).status).toBe(403);
    db.prepare("UPDATE users SET platform_role = 'system_admin' WHERE id = 'u3'").run();
    expect((await create()).status).toBe(403);
    db.prepare("DELETE FROM board_memberships WHERE user_id = 'u3' AND board_id = 'b1'").run();
    const hidden = await request(app).get('/api/v1/cards').set('Authorization',member.authorization);
    expect(hidden.status).toBe(200);
    expect(hidden.body.items).toEqual([]);
    db.prepare("UPDATE users SET active = 0 WHERE id = 'u3'").run();
    db.prepare("UPDATE users SET active = 1 WHERE id = 'u3'").run();
    expect((await create()).status).toBe(401);
  });
  it('denies observer writes, unavailable authority, missing consent and foreign origins', async () => {
    expect((await issue('marcus','BoardAdmin123!',['content:write'],['board:b2'])).result.status).toBe(403);
    const observer = await issue('marcus','BoardAdmin123!',['content:read'],['board:b2']);
    expect(observer.result.status).toBe(201);
    expect((await request(app).post('/api/v1/cards').set('Authorization',observer.authorization).send({boardId:'b2',listId:'l4',title:'Denied'})).status).toBe(403);
    const body = {name:'CSRF',scopes:['content:read'],resources:['board:b1'],expiresInDays:7,confirmation:'CREATE'};
    expect((await observer.agent.post('/api/connections').send(body)).status).toBe(403);
    expect((await observer.agent.post('/api/connections').set('X-Strata-Intent','connections').set('Origin','https://foreign.invalid').send(body)).status).toBe(403);
  });
  it('keeps aggregate, administration, source and destination reads inside the approved board', async () => {
    const {authorization,result}=await issue('alex','WorkspaceAdmin123!',['content:read','content:write','content:manage','account:read','administration:read'],['board:b1']);
    expect(result.status).toBe(201);
    const state=await request(app).get('/api/v1/state').set('Authorization',authorization);
    expect(state.status).toBe(200);
    expect(state.body.appState.boards.map((board:{id:string})=>board.id)).toEqual(['b1']);
    expect(state.body.appState.users.every((user:{boardIds:string[]})=>user.boardIds.every(id=>id==='b1'))).toBe(true);
    const admin=await request(app).get('/api/v1/admin/resources?kind=board&selectedIds=b2').set('Authorization',authorization);
    expect(admin.status).toBe(200);
    expect(admin.body.items.map((board:{id:string})=>board.id)).toEqual(['b1']);
    expect(admin.body.selectedItems).toEqual([]);
    expect((await request(app).get('/api/v1/workspaces/w1/collections').set('Authorization',authorization)).status).toBe(200);
    expect((await request(app).get('/api/v1/admin/users/u2').set('Authorization',authorization)).body.user.workspaceAdminGrants).toEqual([]);
    const foreignList=db.prepare("SELECT id FROM lists WHERE board_id = 'b2' LIMIT 1").pluck().get();
    expect((await request(app).post('/api/v1/cards/c1/move').set('Authorization',authorization).send({toListId:foreignList,toPosition:0})).status).toBe(403);
    expect((await request(app).post('/api/v1/content-operations/preview').set('Authorization',authorization).send({kind:'card_copy',sourceId:'c1',destinationListId:foreignList})).status).toBe(403);
    const first=await request(app).get('/api/v1/cards?limit=1').set('Authorization',authorization);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.nextCursor).toBeTruthy();
    const next=await request(app).get('/api/v1/cards').query({limit:1,cursor:first.body.nextCursor}).set('Authorization',authorization);
    expect(next.body.items[0].id).not.toBe(first.body.items[0].id);
    expect((await request(app).get('/api/v1/cards').query({cursor:first.body.nextCursor,boardId:'b2'}).set('Authorization',authorization)).status).toBe(400);
  });
  it('keeps invitation acceptance inside the credential resource boundary', async () => {
    const {authorization}=await issue('alex','WorkspaceAdmin123!',['account:write'],['board:b1']);
    const token=(await import('../src/db/invitation-repositories')).createBoardInvitation(db,'u2','b2','u2','member',new Date(Date.now()+60000).toISOString()).token;
    expect(token).toBeTruthy();
    expect((await request(app).post('/api/v1/auth/board-invitations/accept').set('Authorization',authorization).send({token})).status).toBe(403);
    expect(db.prepare("SELECT id FROM board_memberships WHERE user_id = 'u2' AND board_id = 'b2'").get()).toBeUndefined();
  });
  it('supports platform administration without disclosing stored authentication hashes or issuing sessions', async () => {
    db.prepare("UPDATE users SET must_change_password = 0 WHERE id = 'u1'").run();
    const {authorization,result}=await issue('admin','ChangeMe123!',['administration:read','administration:write'],['platform']);
    expect(result.status).toBe(201);
    const created=await request(app).post('/api/v1/admin/users').set('Authorization',authorization).send({name:'API user',initials:'AU',color:'#ffffff',username:'api-user',boardMemberships:[{boardId:'b1',role:'observer'}]});
    expect(created.status).toBe(201);
    expect(created.body.user.passwordHash).toBeUndefined();
    expect(created.body.inviteToken).toBeTruthy();
    expect(created.headers['set-cookie']).toBeUndefined();
    const updated=await request(app).patch(`/api/v1/admin/users/${created.body.user.id}`).set('Authorization',authorization).send({name:'Updated',boardMemberships:[{boardId:'b1',role:'observer'}]});
    expect(updated.status).toBe(200);
    expect(updated.body.user.passwordHash).toBeUndefined();
    expect((await request(app).delete(`/api/v1/admin/users/${created.body.user.id}`).set('Authorization',authorization)).status).toBe(400);
    expect((await request(app).delete(`/api/v1/admin/users/${created.body.user.id}`).set('Authorization',authorization).send({confirmation:'DELETE'})).status).toBe(200);
    const boardAdmin=await issue('marcus','BoardAdmin123!',['administration:write'],['board:b1']);
    expect((await request(app).post('/api/v1/admin/users').set('Authorization',boardAdmin.authorization).send({})).status).toBe(403);
  });
  it('enforces credential expiry, TLS and durable rate limits', async () => {
    const {authorization,result}=await issue('alex','WorkspaceAdmin123!',['content:read'],['board:b1']);
    db.prepare("INSERT INTO api_rate_windows VALUES (?,120,?)").run((await import('../src/api/credentials')).digest(`api:${result.body.connection.id}`),Date.now()+60000);
    const limited=await request(app).get('/api/v1/cards').set('Authorization',authorization);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    db.prepare('DELETE FROM api_rate_windows').run();
    db.prepare("UPDATE api_tokens SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect((await request(app).get('/api/v1/cards').set('Authorization',authorization)).status).toBe(401);
    const previous=process.env.NODE_ENV;
    try { for (const environment of ['production','canary']) { process.env.NODE_ENV=environment; expect((await request(app).get('/api/v1/cards').set('Authorization',authorization)).status).toBe(400); } }
    finally { process.env.NODE_ENV=previous; }
  });
  it('prevents a notification credential from marking another user’s notification', async () => {
    const {authorization}=await issue('alex','WorkspaceAdmin123!',['account:write'],['board:b1']);
    db.prepare("INSERT INTO notifications (id,user_id,card_id,board_id,message,read,created_at) VALUES ('foreign-note','u3','c1','b1','Private',0,?)").run(new Date().toISOString());
    expect((await request(app).post('/api/v1/notifications/foreign-note/read').set('Authorization',authorization)).status).toBe(404);
    expect(db.prepare("SELECT read FROM notifications WHERE id = 'foreign-note'").pluck().get()).toBe(0);
  });
  it('attributes card edits and rolls back when the audit write fails', async () => {
    const { authorization, result } = await issue('alex','WorkspaceAdmin123!',['content:write'],['board:b1']);
    const edit = () => request(app).patch('/api/v1/cards/c1').set('Authorization',authorization).send({title:'Audited edit'});
    expect((await edit()).status).toBe(200);
    const event = db.prepare("SELECT actor_user_id, metadata_json FROM audit_events WHERE action = 'card.update' ORDER BY rowid DESC LIMIT 1").get() as {actor_user_id:string;metadata_json:string};
    expect(event).toBeTruthy();
    expect(event.actor_user_id).toBe('u2');
    expect(JSON.parse(event.metadata_json)).toMatchObject({credentialId:result.body.connection.id,operationId:'PATCH /cards/:cardId'});
    db.exec("CREATE TRIGGER reject_api_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'test audit failure'); END");
    expect((await request(app).patch('/api/v1/cards/c1').set('Authorization',authorization).send({title:'Must roll back'})).status).toBe(500);
    expect(db.prepare("SELECT title FROM cards WHERE id = 'c1'").pluck().get()).toBe('Audited edit');
  });
  it('rejects malformed JSON without echoing credential input', async () => {
    const response = await request(app).post('/api/oauth/token').set('Content-Type','application/json').send('{"refresh_token":"strata_refresh_private_input",broken');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({code:'INPUT_INVALID'});
    expect(JSON.stringify(response.body)).not.toContain('strata_refresh_private_input');
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('attributes invitation revocation to the approved connection', async () => {
    const {authorization,result}=await issue('alex','WorkspaceAdmin123!',['administration:write'],['board:b2']);
    const invitation=(await import('../src/db/invitation-repositories')).createBoardInvitation(db,'u2','b2','u2','member',new Date(Date.now()+60000).toISOString());
    expect(invitation.status).toBe('created');
    expect((await request(app).delete(`/api/v1/admin/boards/b2/invitations/${invitation.invitation!.id}`).set('Authorization',authorization)).status).toBe(204);
    const event=db.prepare("SELECT actor_user_id,metadata_json FROM audit_events WHERE action = 'board.invitation_revoke' ORDER BY rowid DESC LIMIT 1").get() as {actor_user_id:string;metadata_json:string};
    expect(event.actor_user_id).toBe('u2');
    expect(JSON.parse(event.metadata_json)).toMatchObject({credentialId:result.body.connection.id,operationId:'DELETE /admin/boards/:boardId/invitations/:invitationId'});
  });

  it('isolates operation receipts per connection and preserves preview and confirmation safeguards', async () => {
    const first=await issue('alex','WorkspaceAdmin123!',['content:write','content:manage'],['board:b1']);
    const second=await issue('alex','WorkspaceAdmin123!',['content:write','content:manage'],['board:b1']);
    const input={kind:'card_copy',sourceId:'c5',destinationListId:'l2'};
    const preview=await request(app).post('/api/v1/content-operations/preview').set('Authorization',first.authorization).send(input);
    expect(preview.status).toBe(200);
    const key=randomUUID(), body={...input,planHash:preview.body.planHash};
    const commit=(authorization:string)=>request(app).post('/api/v1/content-operations').set('Authorization',authorization).set('Idempotency-Key',key).send(body);
    const created=await commit(first.authorization);
    expect(created.status).toBe(201);
    const copyAudit=db.prepare("SELECT metadata_json FROM audit_events WHERE action = 'content.copy' ORDER BY rowid DESC LIMIT 1").pluck().get() as string;
    expect(JSON.parse(copyAudit)).toMatchObject({operationId:created.body.operationId,credentialId:first.result.body.connection.id,operationTemplate:'POST /content-operations'});
    const replay=await commit(first.authorization);
    expect(replay.status).toBe(201);
    expect(replay.body).toMatchObject({resultIds:created.body.resultIds,replayed:true});
    const foreign=await commit(second.authorization);
    expect(foreign.body.replayed).not.toBe(true);
    expect(foreign.body.resultIds).not.toEqual(created.body.resultIds);
    const member=await issue('priya','Member12345!',['content:write'],['board:b1']);
    expect((await request(app).post('/api/v1/content-operations/preview').set('Authorization',member.authorization).send({kind:'board_copy',sourceId:'b1',destinationWorkspaceId:'w1'})).status).toBe(403);
    expect((await request(app).patch('/api/v1/cards/c1').set('Authorization',member.authorization).send({archived:true})).status).toBe(403);
  });
  it('supports workspace and board administration under their current scope', async () => {
    const workspace=await issue('alex','WorkspaceAdmin123!',['content:manage'],['workspace:w1']);
    expect((await request(app).post('/api/v1/boards').set('Authorization',workspace.authorization).send({workspaceId:'w1',title:'Scoped board',color:'#6366f1'})).status).toBe(201);
    const board=await issue('marcus','BoardAdmin123!',['administration:write','content:manage'],['board:b1']);
    expect(board.result.status).toBe(201);
    expect((await request(app).patch('/api/v1/boards/b1').set('Authorization',board.authorization).send({title:'Admin title'})).status).toBe(200);
    expect((await request(app).patch('/api/v1/workspaces/w1').set('Authorization',board.authorization).send({name:'Forbidden parent'})).status).toBe(403);
    expect((await request(app).put('/api/v1/admin/boards/b1/members/u3').set('Authorization',board.authorization).send({role:'observer'})).status).toBe(200);
  });

  it('keeps automation mutations and credential audit writes atomic', async () => {
    const {authorization}=await issue('alex','WorkspaceAdmin123!',['content:manage'],['board:b1']);
    const body={boardId:'b1',name:'Audit rollback',trigger:'card_created',triggerConfig:{},conditions:{listId:null,labelId:null},action:'mark_due_complete',actionConfig:{},enabled:true};
    const created=await request(app).post('/api/v1/automation-rules').set('Authorization',authorization).send(body);
    expect(created.status).toBe(201);
    const before=db.prepare('SELECT * FROM automation_rules ORDER BY id').all();
    db.exec("CREATE TRIGGER reject_automation_audit BEFORE INSERT ON audit_events WHEN NEW.action LIKE 'automation.%' BEGIN SELECT RAISE(ABORT,'test audit failure'); END");
    expect((await request(app).post('/api/v1/automation-rules').set('Authorization',authorization).send(body)).status).toBe(500);
    expect(db.prepare('SELECT * FROM automation_rules ORDER BY id').all()).toEqual(before);
    expect((await request(app).patch(`/api/v1/automation-rules/${created.body.id}`).set('Authorization',authorization).send({name:'Must roll back'})).status).toBe(500);
    expect(db.prepare('SELECT * FROM automation_rules ORDER BY id').all()).toEqual(before);
    expect((await request(app).delete(`/api/v1/automation-rules/${created.body.id}`).set('Authorization',authorization)).status).toBe(500);
    expect(db.prepare('SELECT * FROM automation_rules ORDER BY id').all()).toEqual(before);
  });

});
