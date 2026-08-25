// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase, closeDatabase } from '../src/db/database';
import { createApp } from '../src/app';
import { getUserByUsername } from '../src/db/repositories';

beforeAll(()=>{process.env.SEED_DATA='true'});
async function login(app:ReturnType<typeof createApp>,username:string,password:string){
  const agent=request.agent(app); const response=await agent.post('/api/auth/login').send({username,password});
  expect(response.status).toBe(200); return agent;
}

describe('layered admin access routes',()=>{
  afterEach(()=>closeDatabase());

  it('creates mixed grants and memberships atomically without direct Workspace membership',async()=>{
    const db=await createDatabase(':memory:'); const app=createApp(db); const agent=await login(app,'admin','ChangeMe123!');
    await agent.post('/api/auth/password/change').send({currentPassword:'ChangeMe123!',nextPassword:'Changed12345!',confirmPassword:'Changed12345!'});
    const response=await agent.post('/api/admin/users').send({name:'Mixed Access',initials:'MA',color:'#123456',username:'mixed',platformRole:'user',active:true,workspaceAdminWorkspaceIds:['w1'],boardAdminBoardIds:['b3'],boardMemberships:[{boardId:'b2',role:'observer'}]});
    expect(response.status).toBe(201); const id=response.body.user.id as string;
    expect(db.prepare('SELECT workspace_id FROM workspace_admin_grants WHERE user_id=?').all(id)).toEqual([{workspace_id:'w1'}]);
    expect(db.prepare('SELECT board_id FROM board_admin_grants WHERE user_id=?').all(id)).toEqual([{board_id:'b3'}]);
    expect(db.prepare('SELECT board_id,role FROM board_memberships WHERE user_id=?').all(id)).toEqual([{board_id:'b2',role:'observer'}]);
    expect(db.prepare('SELECT * FROM workspace_memberships WHERE user_id=?').all(id)).toEqual([]);

    const detail=await agent.get(`/api/admin/users/${id}`);
    const promoted=await agent.patch(`/api/admin/users/${id}`).send({
      platformRole:'system_admin',
      expectedUpdatedAt:detail.body.user.updatedAt,
      workspaceAdminWorkspaceIds:['w1'],
      boardAdminBoardIds:['b3'],
      boardMemberships:[{boardId:'b2',role:'observer'}],
    });
    expect(promoted.status).toBe(200);
    expect(db.prepare('SELECT workspace_id FROM workspace_admin_grants WHERE user_id=?').all(id)).toEqual([{workspace_id:'w1'}]);
    expect(db.prepare('SELECT board_id FROM board_admin_grants WHERE user_id=?').all(id)).toEqual([{board_id:'b3'}]);
    expect(db.prepare('SELECT board_id,role FROM board_memberships WHERE user_id=?').all(id)).toEqual([{board_id:'b2',role:'observer'}]);
  });

  it('rejects duplicate, unknown, and stale assignment writes without partial mutation',async()=>{
    const db=await createDatabase(':memory:'); const app=createApp(db); const agent=await login(app,'admin','ChangeMe123!');
    await agent.post('/api/auth/password/change').send({currentPassword:'ChangeMe123!',nextPassword:'Changed12345!',confirmPassword:'Changed12345!'});
    const duplicate=await agent.post('/api/admin/users').send({name:'Bad',initials:'B',color:'#1234',username:'bad',platformRole:'user',active:true,workspaceAdminWorkspaceIds:['w1','w1'],boardAdminBoardIds:[],boardMemberships:[]});
    expect(duplicate.status).toBe(400); expect(getUserByUsername(db,'bad')).toBeNull();
    const unknown=await agent.post('/api/admin/users').send({name:'Bad',initials:'B',color:'#1234',username:'bad2',platformRole:'user',active:true,workspaceAdminWorkspaceIds:[],boardAdminBoardIds:['missing'],boardMemberships:[]});
    expect(unknown.status).toBe(400); expect(getUserByUsername(db,'bad2')).toBeNull();
    const detail=await agent.get('/api/admin/users/u2'); expect(detail.status).toBe(200);
    const stale=await agent.patch('/api/admin/users/u2').send({name:'Changed',expectedUpdatedAt:'2020-01-01T00:00:00.000Z',workspaceAdminWorkspaceIds:['w1'],boardAdminBoardIds:[],boardMemberships:[]});
    expect(stale.status).toBe(409); expect(getUserByUsername(db,'alex')?.name).not.toBe('Changed');
  });

  it('bounds and scopes account and resource search deterministically',async()=>{
    const db=await createDatabase(':memory:'); const app=createApp(db);
    const insert=db.prepare('INSERT INTO users (id,name,initials,color,username,platform_role,password_hash,active,must_change_password,created_at,updated_at) VALUES (?,?,?,?,?,\'user\',\'hash\',1,0,?,?)');
    for(let index=0;index<250;index++){const value=String(index).padStart(3,'0');insert.run(`scale-${value}`,`Scale ${value}`,'S','#1234',`scale${value}`,'2026-01-01','2026-01-01')}
    const insertWorkspace=db.prepare("INSERT INTO workspaces (id,name,description,visibility,created_at) VALUES (?,?,'Scale test','private','2026-01-01')");
    const insertBoard=db.prepare("INSERT INTO boards (id,title,workspace_id,visibility,color,starred,labels_json,created_at) VALUES (?,?,?,'private','#1234',0,'[]','2026-01-01')");
    for(let workspaceIndex=0;workspaceIndex<100;workspaceIndex++){const workspaceValue=String(workspaceIndex).padStart(3,'0');const workspaceId=`scale-workspace-${workspaceValue}`;insertWorkspace.run(workspaceId,`Scale Workspace ${workspaceValue}`);for(let boardIndex=0;boardIndex<10;boardIndex++){const boardValue=String(boardIndex).padStart(2,'0');insertBoard.run(`scale-board-${workspaceValue}-${boardValue}`,`Scale Board ${workspaceValue}-${boardValue}`,workspaceId)}}
    const admin=await login(app,'admin','ChangeMe123!'); await admin.post('/api/auth/password/change').send({currentPassword:'ChangeMe123!',nextPassword:'Changed12345!',confirmPassword:'Changed12345!'});
    const page=await admin.get('/api/admin/users?page=2&pageSize=25&query=scale'); expect(page.status).toBe(200); expect(page.body.users).toHaveLength(25); expect(page.body.page).toMatchObject({page:2,pageSize:25,total:250,totalPages:10}); expect(page.body.users[0].username).toBe('scale025');
    const workspacePage=await admin.get('/api/admin/resources?kind=workspace&query=scale&pageSize=25');expect(workspacePage.body.items).toHaveLength(25);expect(workspacePage.body.page.total).toBe(100);
    const boardPage=await admin.get('/api/admin/resources?kind=board&query=scale&page=40&pageSize=25');expect(boardPage.body.items).toHaveLength(25);expect(boardPage.body.page).toMatchObject({page:40,total:1000,totalPages:40});expect(boardPage.body.items[0].workspaceName).toMatch(/^Scale Workspace/);
    expect((await admin.get('/api/admin/users?pageSize=101')).status).toBe(400);
    const alex=await login(app,'alex','WorkspaceAdmin123!'); const scoped=await alex.get('/api/admin/resources?kind=board&pageSize=25'); expect(scoped.status).toBe(200); expect(scoped.body.items.every((item:{workspaceId:string})=>item.workspaceId==='w1')).toBe(true);
    const priya=await login(app,'priya','Member12345!'); expect((await priya.get('/api/admin/users')).status).toBe(403);
  });

  it('allows non-member scoped admins to manage only memberships in effective Board scope',async()=>{
    const db=await createDatabase(':memory:'); const app=createApp(db); const alex=await login(app,'alex','WorkspaceAdmin123!'); const marcus=await login(app,'marcus','BoardAdmin123!');
    expect(db.prepare('SELECT * FROM board_memberships WHERE user_id=\'u2\'').all()).toEqual([]);
    const invalidCardAssignment=await marcus.patch('/api/cards/c5').send({memberIds:['u4']}); expect(invalidCardAssignment.status).toBe(400);
    const alexAdd=await alex.put('/api/admin/boards/b2/members/u2').send({role:'member'}); expect(alexAdd.status).toBe(200);
    expect(db.prepare('SELECT * FROM workspace_memberships WHERE user_id=\'u2\'').all()).toEqual([]);
    expect((await marcus.put('/api/admin/boards/b1/members/u2').send({role:'member'})).status).toBe(200);
    expect((await marcus.patch('/api/cards/c5').send({memberIds:['u2']})).status).toBe(200);
    expect((await marcus.put('/api/admin/boards/b2/members/u2').send({role:'member'})).status).toBe(403);
    expect((await marcus.post('/api/admin/users').send({})).status).toBe(403);
    expect(db.prepare("SELECT outcome FROM audit_events WHERE actor_user_id='u4' AND action='board.membership_upsert' AND scope_id='b2' ORDER BY created_at DESC LIMIT 1").get()).toEqual({outcome:'failure'});
    const eligible=await marcus.get('/api/admin/boards/b1/eligible-users?query=alex'); expect(eligible.status).toBe(200); expect(eligible.body.items).toEqual([]);
    const removed=await marcus.delete('/api/admin/boards/b1/members/u2'); expect(removed.status).toBe(200);
    expect(JSON.parse((db.prepare('SELECT member_ids_json AS value FROM cards WHERE id=\'c5\'').get() as {value:string}).value)).not.toContain('u2');
  });

  it('revokes scoped authority on the target next request and records non-secret audit evidence',async()=>{
    const db=await createDatabase(':memory:');const app=createApp(db);const alex=await login(app,'alex','WorkspaceAdmin123!');const admin=await login(app,'admin','ChangeMe123!');
    await admin.post('/api/auth/password/change').send({currentPassword:'ChangeMe123!',nextPassword:'Changed12345!',confirmPassword:'Changed12345!'});
    expect((db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id='u2'").get() as {count:number}).count).toBeGreaterThan(0);
    const detail=await admin.get('/api/admin/users/u2');
    const revoked=await admin.patch('/api/admin/users/u2').send({expectedUpdatedAt:detail.body.user.updatedAt,workspaceAdminWorkspaceIds:[],boardAdminBoardIds:[],boardMemberships:[]});
    expect(revoked.status).toBe(200);
    expect((db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id='u2'").get() as {count:number}).count).toBe(0);
    expect((await alex.post('/api/boards').send({workspaceId:'w1',title:'Denied after revocation',color:'#1234'})).status).toBe(401);
    const evidence=db.prepare("SELECT metadata_json AS metadata FROM audit_events WHERE target_user_id='u2' AND action='user.update' ORDER BY created_at DESC LIMIT 1").get() as {metadata:string};
    expect(JSON.parse(evidence.metadata)).toMatchObject({workspaceAdminGrants:0,boardAdminGrants:0,boardMemberships:0});
    expect(evidence.metadata).not.toContain('password');
    expect(evidence.metadata).not.toContain('session');
  });
});
