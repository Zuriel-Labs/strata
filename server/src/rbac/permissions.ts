import type Database from 'better-sqlite3';
import type { AuthContextValue } from '../types';

export function isSystemAdmin(auth: AuthContextValue) {
  return auth.user.platformRole === 'system_admin';
}

export function hasWorkspaceAdminGrant(auth: AuthContextValue, workspaceId: string) {
  return auth.workspaceAdminGrants.some(grant => grant.workspaceId === workspaceId);
}

export function hasBoardAdminGrant(auth: AuthContextValue, boardId: string) {
  return auth.boardAdminGrants.some(grant => grant.boardId === boardId);
}

export function hasBoardMembership(auth: AuthContextValue, boardId: string) {
  return auth.boardMemberships.some(membership => membership.boardId === boardId);
}

export function hasBoardMemberRole(auth: AuthContextValue, boardId: string) {
  return auth.boardMemberships.some(membership => membership.boardId === boardId && membership.role === 'member');
}

export function getBoardWorkspaceId(db: Database.Database, boardId: string) {
  const row = db.prepare('SELECT workspace_id as workspaceId FROM boards WHERE id = ?').get(boardId) as { workspaceId?: string } | undefined;
  return row?.workspaceId ?? null;
}

export function canAccessWorkspace(auth: AuthContextValue, workspaceId: string) {
  return isSystemAdmin(auth) || hasWorkspaceAdminGrant(auth, workspaceId) || auth.derivedWorkspaceIds.includes(workspaceId);
}

export function canManageWorkspace(auth: AuthContextValue, workspaceId: string) {
  return isSystemAdmin(auth) || hasWorkspaceAdminGrant(auth, workspaceId);
}

export function canAccessBoard(db: Database.Database, auth: AuthContextValue, boardId: string) {
  if (isSystemAdmin(auth)) return true;
  if (hasBoardAdminGrant(auth, boardId) || hasBoardMembership(auth, boardId)) return true;
  const workspaceId = getBoardWorkspaceId(db, boardId);
  return workspaceId ? hasWorkspaceAdminGrant(auth, workspaceId) : false;
}

export function canManageBoard(db: Database.Database, auth: AuthContextValue, boardId: string) {
  if (isSystemAdmin(auth)) return true;
  if (hasBoardAdminGrant(auth, boardId)) return true;
  const workspaceId = getBoardWorkspaceId(db, boardId);
  return workspaceId ? canManageWorkspace(auth, workspaceId) : false;
}

export function canManageAutomation(db: Database.Database, auth: AuthContextValue, boardId: string) {
  return canManageBoard(db, auth, boardId);
}

export function canManageBoardLabels(db: Database.Database, auth: AuthContextValue, boardId: string) {
  return canManageBoard(db, auth, boardId);
}

export function canArchiveBoardContent(db: Database.Database, auth: AuthContextValue, boardId: string) {
  return canManageBoard(db, auth, boardId);
}

export function canEditBoardCards(db: Database.Database, auth: AuthContextValue, boardId: string) {
  return canManageBoard(db, auth, boardId) || hasBoardMemberRole(auth, boardId);
}
