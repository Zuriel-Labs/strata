import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export function createServiceIdentity(db:Database.Database,id:string,name:string,createdAt:string) {
  let username=`svc-${id}`;
  if(db.prepare('SELECT 1 FROM users WHERE lower(username)=?').get(username.toLowerCase())) username=`svc-${randomUUID()}`;
  const initials=Array.from(name.trim()).slice(0,2).join('').toUpperCase();
  db.prepare(`INSERT INTO users (id,name,initials,color,username,platform_role,password_hash,active,is_service_account,created_at,updated_at)
    VALUES (?,?,?,?,?,'user','!service-account',0,1,?,?)`).run(id,name,initials,'#6179b9',username,createdAt,createdAt);
}

export function serviceAdminResources(db:Database.Database,id:string):string[] {
  const platform=db.prepare('SELECT platform_access FROM api_service_accounts WHERE id=?').pluck().get(id);
  const workspaces=db.prepare("SELECT 'workspace:' || workspace_id FROM workspace_admin_grants WHERE user_id=? ORDER BY workspace_id").pluck().all(id) as string[];
  const boards=db.prepare("SELECT 'board:' || board_id FROM board_admin_grants WHERE user_id=? ORDER BY board_id").pluck().all(id) as string[];
  return [...(platform?['platform']:[]),...workspaces,...boards];
}

export function setServiceAdminResources(db:Database.Database,id:string,resources:string[],ownerId:string,now:string) {
  db.prepare('UPDATE api_service_accounts SET platform_access=? WHERE id=?').run(Number(resources.includes('platform')),id);
  db.prepare('DELETE FROM workspace_admin_grants WHERE user_id=?').run(id);
  db.prepare('DELETE FROM board_admin_grants WHERE user_id=?').run(id);
  db.prepare('DELETE FROM workspace_memberships WHERE user_id=?').run(id);
  for(const resource of resources){
    const [kind,resourceId]=resource.split(':');
    if(kind==='workspace'&&db.prepare('SELECT 1 FROM workspaces WHERE id=?').get(resourceId)){
      db.prepare('INSERT INTO workspace_admin_grants (id,user_id,workspace_id,granted_by_user_id,created_at) VALUES (?,?,?,?,?)').run(randomUUID(),id,resourceId,ownerId,now);
      db.prepare("INSERT INTO workspace_memberships (id,user_id,workspace_id,role,created_at) VALUES (?,?,?,'member',?)").run(randomUUID(),id,resourceId,now);
    }
    if(kind==='board'&&db.prepare('SELECT 1 FROM boards WHERE id=?').get(resourceId)){
      db.prepare('INSERT INTO board_admin_grants (id,user_id,board_id,granted_by_user_id,created_at) VALUES (?,?,?,?,?)').run(randomUUID(),id,resourceId,ownerId,now);
      db.prepare("INSERT OR IGNORE INTO board_memberships (id,user_id,board_id,role,created_at) VALUES (?,?,?,'member',?)").run(`service-default:${id}:${resourceId}`,id,resourceId,now);
    }
  }
}
