// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { createDatabase, type DatabaseHandle } from '../src/db/database';

const intent = 'X-Strata-Intent';
const api = '/api/connections';
const services = `${api}/service-accounts`;
const key = (name:string,actions:string[],resources:string[],expiresInDays=7) => ({ name,actions,resources,expiresInDays,confirmation:'CREATE' });
const bearer = (token:string) => `Bearer ${token}`;

describe('granular keys and service accounts',()=>{
  let db:DatabaseHandle;
  let app:ReturnType<typeof createApp>;
  beforeEach(async()=>{process.env.SEED_DATA='true';db=await createDatabase(':memory:');app=createApp(db)});
  afterEach(()=>db.close());
  async function login(username:string,password:string){
    const agent=request.agent(app);
    expect((await agent.post('/api/auth/login').send({username,password})).status).toBe(200);
    return agent;
  }

  it('creates independently revocable keys with discrete expiry choices and exact actions',async()=>{
    const user=await login('priya','Member12345!');
    const catalog=await user.get(`${api}/catalog`);
    expect(catalog.body.expiries).toEqual([1,7,30,60,90,180]);
    const board=catalog.body.resources.find((item:{id:string})=>item.id==='board:b1');
    expect(board.actions).toContain('GET /cards');
    expect(board.actions).not.toContain('PATCH /boards/:boardId');
    expect(catalog.body.resources.some((item:{id:string})=>item.id==='platform')).toBe(false);
    const all=[];
    for(const days of [1,7,30,60,90,180]){
      const result=await user.post(api).set(intent,'connections').send(key(`Read ${days}`,['GET /cards'],['board:b1'],days));
      expect(result.status).toBe(201);
      expect(result.body.token).toMatch(/^strata_key_/);
      expect(Date.parse(result.body.connection.expiresAt)-Date.parse(result.body.connection.createdAt)).toBe(days*86_400_000);
      all.push(result.body);
    }
    expect(new Set(all.map(item=>item.token)).size).toBe(6);
    expect((await user.post(api).set(intent,'connections').send(key('Bad expiry',['GET /cards'],['board:b1'],2))).status).toBe(400);
    expect((await user.post(api).set(intent,'connections').send(key('Bad permission',['PATCH /boards/:boardId'],['board:b1']))).status).toBe(403);
    const list=await user.get(api);
    expect(list.body.items).toHaveLength(6);
    expect(JSON.stringify(list.body)).not.toContain(all[0].token);
    const read=await request(app).get('/api/v1/cards').set('Authorization',bearer(all[0].token));
    expect(read.status).toBe(200);
    expect(read.body.items.every((item:{boardId:string})=>item.boardId==='b1')).toBe(true);
    for(const path of ['/api/v1/lists','/api/v1/cards/c1','/api/v1/admin/audit']){
      expect((await request(app).get(path).set('Authorization',bearer(all[0].token))).status).toBe(403);
    }
    expect((await user.delete(`${api}/${all[0].connection.id}`).set(intent,'connections')).status).toBe(204);
    expect((await request(app).get('/api/v1/cards').set('Authorization',bearer(all[0].token))).status).toBe(401);
    expect((await request(app).get('/api/v1/cards').set('Authorization',bearer(all[5].token))).status).toBe(200);
  });

  it('keeps archive, edits, audit reads and account-only actions separate',async()=>{
    db.prepare("UPDATE users SET must_change_password=0 WHERE id='u1'").run();
    const admin=await login('admin','ChangeMe123!');
    const create=(actions:string[],resources:string[])=>admin.post(api).set(intent,'connections').send(key('Specific',actions,resources));
    const archive=await create(['card:archive'],['board:b1']);
    expect(archive.status).toBe(201);
    const edit=(body:object)=>request(app).patch('/api/v1/cards/c1').set('Authorization',bearer(archive.body.token)).send(body);
    expect((await edit({title:'Denied'})).status).toBe(403);
    expect((await edit({archived:true,title:'Denied'})).status).toBe(403);
    expect((await edit({archived:true})).status).toBe(200);
    const profile=await create(['admin:user_profile'],['platform']);
    expect(profile.status).toBe(201);
    const updateUser=(body:object)=>request(app).patch('/api/v1/admin/users/u3').set('Authorization',bearer(profile.body.token)).send(body);
    expect((await updateUser({name:'Changed profile'})).status).toBe(200);
    expect((await updateUser({name:'Denied',boardMemberships:[]})).status).toBe(403);
    expect((await updateUser({active:false})).status).toBe(403);
    expect(db.prepare("SELECT role FROM board_memberships WHERE user_id='u3' AND board_id='b1'").pluck().get()).toBe('member');
    expect((await create(['GET /cards'],['account'])).status).toBe(403);
    const own=await create(['GET /me'],['account']);
    expect(own.status).toBe(201);
    expect((await request(app).get('/api/v1/me').set('Authorization',bearer(own.body.token))).status).toBe(200);
    const people=await create(['GET /admin/users'],['platform']);
    const directory=await request(app).get('/api/v1/admin/users').set('Authorization',bearer(people.body.token));
    expect(directory.status).toBe(200);
    expect(directory.body.auditEvents).toEqual([]);
    expect((await request(app).get('/api/v1/admin/audit').set('Authorization',bearer(people.body.token))).status).toBe(403);
    const audit=await create(['GET /admin/audit'],['platform']);
    expect((await request(app).get('/api/v1/admin/audit').set('Authorization',bearer(audit.body.token))).body.auditEvents.length).toBeGreaterThan(0);
  });

  it('uses the same endpoints, audits the agent, and revokes old access on an ownership transfer',async()=>{
    const owner=await login('alex','WorkspaceAdmin123!');
    const successor=await login('marcus','BoardAdmin123!');
    const basic=await login('priya','Member12345!');
    const actions=['GET /cards','card:title','PATCH /workspaces/:workspaceId'];
    const input=key('Board assistant',actions,['workspace:w1']);
    expect((await basic.post(services).set(intent,'connections').send(input)).status).toBe(403);
    const made=await owner.post(services).set(intent,'connections').send(input);
    expect(made.status).toBe(201);
    const {id}=made.body.account;
    const auth=bearer(made.body.token);
    expect((await owner.get(api)).body.items).toEqual([]);
    expect((await successor.get(services)).body.items).toEqual([]);
    expect((await owner.get(services).set('Authorization',auth)).status).toBe(403);
    expect((await owner.post(services).set(intent,'connections').send({...input,name:'board ASSISTANT'})).status).toBe(409);
    expect((await owner.post(services).set(intent,'connections').send(key('Personal',['GET /me'],['workspace:w1']))).status).toBe(403);
    expect((await request(app).patch('/api/v1/cards/c1').set('Authorization',auth).send({title:'Agent edit'})).status).toBe(200);
    const metadata=db.prepare("SELECT metadata_json FROM audit_events WHERE action='card.update' ORDER BY rowid DESC LIMIT 1").pluck().get();
    expect(JSON.parse(String(metadata))).toMatchObject({serviceAccountId:id,serviceAccountName:'Board assistant'});
    expect((await successor.delete(`${services}/${id}/key`).set(intent,'connections')).status).toBe(404);
    const transfer=(username:string)=>owner.post(`${services}/${id}/transfer`).set(intent,'connections').send({username,confirmation:'TRANSFER'});
    expect((await transfer('priya')).status).toBe(400);
    expect((await transfer('marcus')).status).toBe(204);
    expect((await request(app).get('/api/v1/cards').set('Authorization',auth)).status).toBe(401);
    expect((await owner.get(services)).body.items).toEqual([]);
    const accounts=(await successor.get(services)).body.items;
    expect(accounts).toEqual([{id,name:'Board assistant',resources:['board:b1'],actions:['GET /cards','card:title'],key:null}]);
    const issue=(body:object)=>successor.post(`${services}/${id}/key`).set(intent,'connections').send(body);
    expect((await issue(input)).status).toBe(403);
    const renewed=await issue(key('Board assistant',accounts[0].actions,accounts[0].resources,180));
    expect(renewed.status).toBe(201);
    const requestCards=()=>request(app).get('/api/v1/cards').set('Authorization',bearer(renewed.body.token));
    expect((await requestCards()).body.items.every((item:{boardId:string})=>item.boardId==='b1')).toBe(true);
    db.prepare("DELETE FROM board_admin_grants WHERE user_id='u4' AND board_id='b1'").run();
    expect((await requestCards()).status).toBe(401);
  });
});
