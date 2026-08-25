import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { countSystemAdmins, createAuditEvent, getBoardAdminGrantsForUser, getBoardMembershipsForUser, getDerivedWorkspaceIdsForUser, getUserById, getWorkspaceAdminGrantsForUser } from './repositories';
import type { AuthContextValue, BoardMembershipRecord, PlatformRole, UserRecord } from '../types';

export type AssignmentInput = {
  workspaceAdminWorkspaceIds: string[];
  boardAdminBoardIds: string[];
  boardMemberships: Array<{ boardId: string; role: BoardMembershipRecord['role'] }>;
};
export type ManagedUserInput = {
  name: string; initials: string; color: string; username: string; platformRole: PlatformRole;
  passwordHash: string; mustChangePassword: boolean; active: boolean; expectedUpdatedAt?: string | null;
} & AssignmentInput;
export type PageInput = { query: string; page: number; pageSize: number };
export interface DeleteManagedUserResult { deletedUserId: string; username: string; removedCardAssignments: number; remediatedAutomationRules: number }

function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function manageableBoardIds(db: Database.Database, actor: AuthContextValue) {
  if (actor.user.platformRole === 'system_admin') return (db.prepare('SELECT id FROM boards').all() as Array<{ id: string }>).map(row => row.id);
  const ids = new Set(actor.boardAdminGrants.map(grant => grant.boardId));
  if (actor.workspaceAdminGrants.length) {
    const values = actor.workspaceAdminGrants.map(grant => grant.workspaceId);
    const rows = db.prepare(`SELECT id FROM boards WHERE workspace_id IN (${values.map(() => '?').join(', ')})`).all(...values) as Array<{ id: string }>;
    rows.forEach(row => ids.add(row.id));
  }
  return [...ids];
}

function scopedUserIds(db: Database.Database, actor: AuthContextValue) {
  if (actor.user.platformRole === 'system_admin') return null;
  const ids = new Set<string>([actor.user.id]);
  const boardIds = manageableBoardIds(db, actor);
  if (boardIds.length) {
    const rows = db.prepare(`SELECT DISTINCT user_id AS userId FROM board_memberships WHERE board_id IN (${boardIds.map(() => '?').join(', ')})`).all(...boardIds) as Array<{ userId: string }>;
    rows.forEach(row => ids.add(row.userId));
  }
  return [...ids];
}

export function listAdminUsersPage(db: Database.Database, actor: AuthContextValue, input: PageInput) {
  const scopedIds = scopedUserIds(db, actor);
  const scopedBoards = actor.user.platformRole === 'system_admin' ? null : manageableBoardIds(db, actor);
  const where = ['(lower(name) LIKE ? OR lower(username) LIKE ?)'];
  const query = `%${input.query.toLowerCase()}%`;
  const params: Array<string | number> = [query, query];
  if (scopedIds) { where.push(`id IN (${scopedIds.map(() => '?').join(', ')})`); params.push(...scopedIds); }
  const whereSql = where.join(' AND ');
  const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM users WHERE ${whereSql}`).get(...params) as { count: number }).count);
  const rows = db.prepare(`
    SELECT users.*,
      (SELECT COUNT(*) FROM workspace_admin_grants WHERE user_id = users.id) AS workspace_admin_count,
      (SELECT COUNT(*) FROM board_admin_grants WHERE user_id = users.id) AS board_admin_count,
      (SELECT COUNT(*) FROM board_memberships WHERE user_id = users.id) AS board_membership_count,
      (SELECT COUNT(DISTINCT boards.workspace_id) FROM board_memberships JOIN boards ON boards.id = board_memberships.board_id WHERE board_memberships.user_id = users.id) AS derived_workspace_count
    FROM users WHERE ${whereSql}
    ORDER BY lower(name), lower(username), id LIMIT ? OFFSET ?
  `).all(...params, input.pageSize, (input.page - 1) * input.pageSize) as Array<Record<string, unknown>>;
  return {
    users: rows.map(row => {
      const userId=String(row.id);
      let membershipCount=Number(row.board_membership_count); let derivedCount=Number(row.derived_workspace_count);
      if(scopedBoards){
        if(scopedBoards.length){
          const placeholders=scopedBoards.map(()=>'?').join(', ');
          membershipCount=Number((db.prepare(`SELECT COUNT(*) AS count FROM board_memberships WHERE user_id=? AND board_id IN (${placeholders})`).get(userId,...scopedBoards) as {count:number}).count);
          derivedCount=Number((db.prepare(`SELECT COUNT(DISTINCT boards.workspace_id) AS count FROM board_memberships JOIN boards ON boards.id=board_memberships.board_id WHERE board_memberships.user_id=? AND board_memberships.board_id IN (${placeholders})`).get(userId,...scopedBoards) as {count:number}).count);
        }else{membershipCount=0;derivedCount=0}
      }
      const mayViewOwnAuthority=actor.user.platformRole==='system_admin'||actor.user.id===userId;
      return {
        id:userId,name:String(row.name),initials:String(row.initials),color:String(row.color),username:String(row.username),
        platformRole:row.platform_role==='system_admin'?'system_admin' as const:'user' as const,
        active:Boolean(row.active),mustChangePassword:Boolean(row.must_change_password),createdAt:String(row.created_at),updatedAt:String(row.updated_at),
        counts:{workspaceAdminGrants:mayViewOwnAuthority?Number(row.workspace_admin_count):0,boardAdminGrants:mayViewOwnAuthority?Number(row.board_admin_count):0,boardMemberships:membershipCount,derivedWorkspaces:derivedCount},
      };
    }),
    page: pageMeta(input.page, input.pageSize, total),
  };
}

export function getAdminUserDetail(db: Database.Database, actor: AuthContextValue, userId: string) {
  const scopedIds = scopedUserIds(db, actor);
  if (scopedIds && !scopedIds.includes(userId)) return null;
  const user = getUserById(db, userId); if (!user) return null;
  const systemAdmin=actor.user.platformRole==='system_admin'; const own=actor.user.id===userId;
  const visibleBoards=systemAdmin?null:manageableBoardIds(db,actor);
  const memberships=getBoardMembershipsForUser(db,userId).filter(item=>visibleBoards===null||visibleBoards.includes(item.boardId));
  return {
    id: user.id, name: user.name, initials: user.initials, color: user.color, username: user.username,
    platformRole: user.platformRole, active: user.active, mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt, updatedAt: user.updatedAt,
    workspaceAdminGrants: systemAdmin||own?getWorkspaceAdminGrantsForUser(db,userId):[],
    boardAdminGrants: systemAdmin||own?getBoardAdminGrantsForUser(db,userId):[],
    boardMemberships: memberships,
    derivedWorkspaceIds:[...new Set(memberships.map(item=>(db.prepare('SELECT workspace_id AS workspaceId FROM boards WHERE id=?').get(item.boardId) as {workspaceId:string}).workspaceId))],
  };
}

export function listAdminResources(db: Database.Database, actor: AuthContextValue, kind: 'workspace' | 'board', input: PageInput, workspaceId?: string, selectedIds: string[] = []) {
  const query = `%${input.query.toLowerCase()}%`; const offset = (input.page - 1) * input.pageSize;
  if (kind === 'workspace') {
    const allowed = actor.user.platformRole === 'system_admin' ? null : actor.workspaceAdminGrants.map(grant => grant.workspaceId);
    if (allowed?.length === 0) return { items: [], selectedItems: [], page: pageMeta(input.page, input.pageSize, 0) };
    const scope = allowed ? ` AND id IN (${allowed.map(() => '?').join(', ')})` : '';
    const params = allowed ? [query, ...allowed] : [query];
    const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM workspaces WHERE lower(name) LIKE ?${scope}`).get(...params) as { count: number }).count);
    const rows = db.prepare(`SELECT id, name FROM workspaces WHERE lower(name) LIKE ?${scope} ORDER BY lower(name), id LIMIT ? OFFSET ?`).all(...params, input.pageSize, offset) as Array<{ id: string; name: string }>;
    const selectedScope = allowed ? selectedIds.filter(id => allowed.includes(id)) : selectedIds;
    const selectedRows = selectedScope.length ? db.prepare(`SELECT id,name FROM workspaces WHERE id IN (${selectedScope.map(()=>'?').join(', ')}) ORDER BY lower(name),id`).all(...selectedScope) as Array<{id:string;name:string}> : [];
    return { items: rows.map(row => ({ ...row, kind: 'workspace' as const, workspaceId: null, workspaceName: null })), selectedItems:selectedRows.map(row=>({...row,kind:'workspace' as const,workspaceId:null,workspaceName:null})), page: pageMeta(input.page, input.pageSize, total) };
  }
  const allowed = manageableBoardIds(db, actor);
  if (actor.user.platformRole !== 'system_admin' && !allowed.length) return { items: [], selectedItems: [], page: pageMeta(input.page, input.pageSize, 0) };
  const clauses = ['(lower(boards.title) LIKE ? OR lower(workspaces.name) LIKE ?)']; const params: Array<string | number> = [query, query];
  if (workspaceId) { clauses.push('boards.workspace_id = ?'); params.push(workspaceId); }
  if (actor.user.platformRole !== 'system_admin') { clauses.push(`boards.id IN (${allowed.map(() => '?').join(', ')})`); params.push(...allowed); }
  const where = clauses.join(' AND ');
  const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM boards JOIN workspaces ON workspaces.id=boards.workspace_id WHERE ${where}`).get(...params) as { count: number }).count);
  const rows = db.prepare(`SELECT boards.id, boards.title AS name, boards.workspace_id AS workspaceId, workspaces.name AS workspaceName FROM boards JOIN workspaces ON workspaces.id=boards.workspace_id WHERE ${where} ORDER BY lower(workspaces.name), lower(boards.title), boards.id LIMIT ? OFFSET ?`).all(...params, input.pageSize, offset) as Array<{ id: string; name: string; workspaceId: string; workspaceName: string }>;
  const selectedScope=actor.user.platformRole==='system_admin'?selectedIds:selectedIds.filter(id=>allowed.includes(id));
  const selectedRows=selectedScope.length?db.prepare(`SELECT boards.id,boards.title AS name,boards.workspace_id AS workspaceId,workspaces.name AS workspaceName FROM boards JOIN workspaces ON workspaces.id=boards.workspace_id WHERE boards.id IN (${selectedScope.map(()=>'?').join(', ')}) ORDER BY lower(workspaces.name),lower(boards.title),boards.id`).all(...selectedScope) as Array<{id:string;name:string;workspaceId:string;workspaceName:string}>:[];
  return { items: rows.map(row => ({ ...row, kind: 'board' as const })), selectedItems:selectedRows.map(row=>({...row,kind:'board' as const})), page: pageMeta(input.page, input.pageSize, total) };
}

export function listBoardMembers(db: Database.Database, actor: AuthContextValue, boardId: string, input: PageInput) {
  if (!manageableBoardIds(db, actor).includes(boardId)) return null;
  const query = `%${input.query.toLowerCase()}%`;
  const filter = 'board_id=? AND (lower(users.name) LIKE ? OR lower(users.username) LIKE ?)';
  const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM board_memberships JOIN users ON users.id=board_memberships.user_id WHERE ${filter}`).get(boardId, query, query) as { count: number }).count);
  const rows = db.prepare(`SELECT users.id,users.name,users.username,users.initials,users.color,board_memberships.role FROM board_memberships JOIN users ON users.id=board_memberships.user_id WHERE ${filter} ORDER BY lower(users.name),users.id LIMIT ? OFFSET ?`).all(boardId, query, query, input.pageSize, (input.page - 1) * input.pageSize) as Array<Record<string, unknown>>;
  return { items: rows.map(row => ({ id:String(row.id), name:String(row.name), username:String(row.username), initials:String(row.initials), color:String(row.color), role:String(row.role) })), page: pageMeta(input.page, input.pageSize, total) };
}

export function listEligibleUsers(db: Database.Database, actor: AuthContextValue, boardId: string, input: PageInput) {
  if (!manageableBoardIds(db, actor).includes(boardId)) return null;
  const query = `%${input.query.toLowerCase()}%`;
  const filter = 'active=1 AND NOT EXISTS (SELECT 1 FROM board_memberships WHERE board_id=? AND user_id=users.id) AND (lower(name) LIKE ? OR lower(username) LIKE ?)';
  const total = Number((db.prepare(`SELECT COUNT(*) AS count FROM users WHERE ${filter}`).get(boardId, query, query) as { count: number }).count);
  const rows = db.prepare(`SELECT id,name,username,initials,color FROM users WHERE ${filter} ORDER BY lower(name),lower(username),id LIMIT ? OFFSET ?`).all(boardId, query, query, input.pageSize, (input.page - 1) * input.pageSize) as Array<Record<string, unknown>>;
  return { items: rows.map(row => ({ id:String(row.id), name:String(row.name), username:String(row.username), initials:String(row.initials), color:String(row.color) })), page: pageMeta(input.page, input.pageSize, total) };
}

function removeUserFromCardMemberships(db: Database.Database, userId: string) {
  const rows = db.prepare('SELECT id,member_ids_json FROM cards').all() as Array<{ id:string; member_ids_json:string }>; let count=0;
  for (const row of rows) { const ids=JSON.parse(row.member_ids_json) as string[]; if (!ids.includes(userId)) continue; const next=ids.filter(id=>id!==userId); count+=ids.length-next.length; db.prepare('UPDATE cards SET member_ids_json=? WHERE id=?').run(JSON.stringify(next),row.id); }
  return count;
}
function remediateAutomationAssignments(db: Database.Database, userId: string) {
  const rows=db.prepare("SELECT id,action_config_json FROM automation_rules WHERE action='assign_member'").all() as Array<{id:string;action_config_json:string}>; let count=0;
  for (const row of rows) { const config=JSON.parse(row.action_config_json) as Record<string,string>; if(config.memberId!==userId) continue; delete config.memberId; db.prepare('UPDATE automation_rules SET action_config_json=?,enabled=0 WHERE id=?').run(JSON.stringify(config),row.id); count++; }
  return count;
}

export function validateAssignments(db: Database.Database, input: AssignmentInput) {
  const sets=[input.workspaceAdminWorkspaceIds,input.boardAdminBoardIds,input.boardMemberships.map(item=>item.boardId)];
  if(sets.some(ids=>new Set(ids).size!==ids.length)) throw new Error('Assignment lists cannot contain duplicates.');
  const check=(table:'workspaces'|'boards',ids:string[])=>{ if(!ids.length)return; const found=Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE id IN (${ids.map(()=>'?').join(', ')})`).get(...ids) as {count:number}).count); if(found!==ids.length)throw new Error(`One or more ${table} do not exist.`); };
  check('workspaces',input.workspaceAdminWorkspaceIds); check('boards',[...new Set([...input.boardAdminBoardIds,...input.boardMemberships.map(item=>item.boardId)])]);
}

export function replaceAssignments(db: Database.Database, actorId:string, userId:string, input:AssignmentInput) {
  db.prepare('DELETE FROM workspace_admin_grants WHERE user_id=?').run(userId); db.prepare('DELETE FROM board_admin_grants WHERE user_id=?').run(userId); db.prepare('DELETE FROM board_memberships WHERE user_id=?').run(userId);
  const now=new Date().toISOString(); const wg=db.prepare('INSERT INTO workspace_admin_grants (id,user_id,workspace_id,granted_by_user_id,created_at) VALUES (?,?,?,?,?)'); const bg=db.prepare('INSERT INTO board_admin_grants (id,user_id,board_id,granted_by_user_id,created_at) VALUES (?,?,?,?,?)'); const bm=db.prepare('INSERT INTO board_memberships (id,user_id,board_id,role,created_at) VALUES (?,?,?,?,?)');
  input.workspaceAdminWorkspaceIds.forEach(id=>wg.run(randomUUID(),userId,id,actorId,now)); input.boardAdminBoardIds.forEach(id=>bg.run(randomUUID(),userId,id,actorId,now)); input.boardMemberships.forEach(item=>bm.run(randomUUID(),userId,item.boardId,item.role,now));
}

export function createManagedUser(db:Database.Database, actor:UserRecord, input:ManagedUserInput) {
  validateAssignments(db,input);
  return db.transaction(()=>{ const id=randomUUID(); const now=new Date().toISOString(); db.prepare('INSERT INTO users (id,name,initials,color,username,platform_role,password_hash,active,must_change_password,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,input.name,input.initials,input.color,input.username,input.platformRole,input.passwordHash,input.active?1:0,input.mustChangePassword?1:0,now,now); replaceAssignments(db,actor.id,id,input); createAuditEvent(db,{actorUserId:actor.id,targetUserId:id,scopeType:'platform',action:'user.create',outcome:'success',metadata:{workspaceAdminGrants:input.workspaceAdminWorkspaceIds.length,boardAdminGrants:input.boardAdminBoardIds.length,boardMemberships:input.boardMemberships.length}}); return getUserById(db,id); })();
}

export function updateManagedUser(db:Database.Database, actor:UserRecord, userId:string, input:Partial<Omit<ManagedUserInput,keyof AssignmentInput>>&AssignmentInput) {
  validateAssignments(db,input);
  return db.transaction(()=>{ const current=getUserById(db,userId); if(!current)return null; if(input.expectedUpdatedAt&&input.expectedUpdatedAt!==current.updatedAt)throw new Error('This account changed since it was loaded. Refresh and try again.'); if(current.platformRole==='system_admin'&&input.platformRole==='user'&&countSystemAdmins(db)<=1)throw new Error('Cannot remove the last remaining system administrator.'); if(current.platformRole==='system_admin'&&input.active===false&&countSystemAdmins(db)<=1)throw new Error('Cannot deactivate the last remaining system administrator.'); const candidateTimestamp=new Date().toISOString(); const now=candidateTimestamp===current.updatedAt?new Date(Date.parse(candidateTimestamp)+1).toISOString():candidateTimestamp; db.prepare('UPDATE users SET name=?,initials=?,color=?,username=?,platform_role=?,active=?,must_change_password=?,updated_at=? WHERE id=?').run(input.name??current.name,input.initials??current.initials,input.color??current.color,input.username??current.username,input.platformRole??current.platformRole,input.active===undefined?(current.active?1:0):input.active?1:0,input.mustChangePassword===undefined?(current.mustChangePassword?1:0):input.mustChangePassword?1:0,now,userId); replaceAssignments(db,actor.id,userId,input); createAuditEvent(db,{actorUserId:actor.id,targetUserId:userId,scopeType:'platform',action:'user.update',outcome:'success',metadata:{workspaceAdminGrants:input.workspaceAdminWorkspaceIds.length,boardAdminGrants:input.boardAdminBoardIds.length,boardMemberships:input.boardMemberships.length}}); return getUserById(db,userId); })();
}

export function upsertBoardMembership(db:Database.Database, actor:UserRecord, boardId:string, userId:string, role:BoardMembershipRecord['role']) {
  const user=getUserById(db,userId); if(!user||!user.active)return null; const now=new Date().toISOString(); db.prepare('INSERT INTO board_memberships (id,user_id,board_id,role,created_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,board_id) DO UPDATE SET role=excluded.role').run(randomUUID(),userId,boardId,role,now); createAuditEvent(db,{actorUserId:actor.id,targetUserId:userId,scopeType:'board',scopeId:boardId,action:'board.membership_upsert',outcome:'success',metadata:{role}}); return getBoardMembershipsForUser(db,userId).find(item=>item.boardId===boardId)??null;
}
export function deleteBoardMembership(db:Database.Database, actor:UserRecord, boardId:string, userId:string) {
  return db.transaction(()=>{
    const result=db.prepare('DELETE FROM board_memberships WHERE board_id=? AND user_id=?').run(boardId,userId); if(!result.changes)return null;
    const cards=db.prepare('SELECT id,member_ids_json FROM cards WHERE board_id=?').all(boardId) as Array<{id:string;member_ids_json:string}>;
    for(const card of cards){const ids=JSON.parse(card.member_ids_json) as string[];if(ids.includes(userId))db.prepare('UPDATE cards SET member_ids_json=? WHERE id=?').run(JSON.stringify(ids.filter(id=>id!==userId)),card.id)}
    const rules=db.prepare("SELECT id,action_config_json FROM automation_rules WHERE board_id=? AND action='assign_member'").all(boardId) as Array<{id:string;action_config_json:string}>;
    for(const rule of rules){const config=JSON.parse(rule.action_config_json) as Record<string,string>;if(config.memberId===userId){delete config.memberId;db.prepare('UPDATE automation_rules SET action_config_json=?,enabled=0 WHERE id=?').run(JSON.stringify(config),rule.id)}}
    createAuditEvent(db,{actorUserId:actor.id,targetUserId:userId,scopeType:'board',scopeId:boardId,action:'board.membership_delete',outcome:'success'});
    return {userId,boardId,derivedWorkspaceIds:getDerivedWorkspaceIdsForUser(db,userId)};
  })();
}

export function deleteManagedUser(db:Database.Database, actor:UserRecord, userId:string):DeleteManagedUserResult|null {
  const current=getUserById(db,userId); if(!current)return null; if(actor.id===userId)throw new Error('Cannot delete the currently authenticated user.'); if(current.platformRole==='system_admin'&&current.active&&countSystemAdmins(db)<=1)throw new Error('Cannot delete the last remaining system administrator.');
  return db.transaction(()=>{ const removedCardAssignments=removeUserFromCardMemberships(db,userId); const remediatedAutomationRules=remediateAutomationAssignments(db,userId); db.prepare('DELETE FROM users WHERE id=?').run(userId); createAuditEvent(db,{actorUserId:actor.id,targetUserId:userId,scopeType:'platform',action:'user.delete',outcome:'success',metadata:{username:current.username,removedCardAssignments,remediatedAutomationRules}}); return {deletedUserId:userId,username:current.username,removedCardAssignments,remediatedAutomationRules}; })();
}
