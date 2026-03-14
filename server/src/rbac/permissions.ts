import type Database from 'better-sqlite3';
import type { AuthContextValue } from '../types';

export function isSystemAdmin(auth: AuthContextValue) {
  return auth.user.platformRole === 'system_admin';
}

export function hasWorkspaceRole(auth: AuthContextValue, workspaceId: string, roles: string[]) {
  return auth.workspaceMemberships.some(membership => membership.workspaceId === workspaceId && roles.includes(membership.role));
}

export function hasBoardRole(auth: AuthContextValue, boardId: string, roles: string[]) {
  return auth.boardMemberships.some(membership => membership.boardId === boardId && roles.includes(membership.role));
}

export function getBoardWorkspaceId(db: Database.Database, boardId: string) {
  const row = db.prepare('SELECT workspace_id as workspaceId FROM boards WHERE id = ?').get(boardId) as { workspaceId?: string } | undefined;
  return row?.workspaceId ?? null;
}

export function canAccessWorkspace(auth: AuthContextValue, workspaceId: string) {
  return isSystemAdmin(auth) || hasWorkspaceRole(auth, workspaceId, ['workspace_admin', 'member']);
}

export function canManageWorkspace(auth: AuthContextValue, workspaceId: string) {
  return isSystemAdmin(auth) || hasWorkspaceRole(auth, workspaceId, ['workspace_admin']);
}

export function canAccessBoard(db: Database.Database, auth: AuthContextValue, boardId: string) {
  if (isSystemAdmin(auth)) return true;
  if (hasBoardRole(auth, boardId, ['board_admin', 'member', 'observer'])) return true;
  const workspaceId = getBoardWorkspaceId(db, boardId);
  return workspaceId ? canAccessWorkspace(auth, workspaceId) : false;
}

export function canManageBoard(db: Database.Database, auth: AuthContextValue, boardId: string) {
  if (isSystemAdmin(auth)) return true;
  if (hasBoardRole(auth, boardId, ['board_admin'])) return true;
  const workspaceId = getBoardWorkspaceId(db, boardId);
  return workspaceId ? canManageWorkspace(auth, workspaceId) : false;
}
