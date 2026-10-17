import type Database from 'better-sqlite3';
import type { AuthContextValue } from '../types';
import { userHasAccessToBoard, userHasAccessToWorkspace } from '../db/repositories';
import { canManageBoard, canManageWorkspace, isSystemAdmin } from './permissions';

export function canManageUserPlatform(actor: AuthContextValue) {
  return isSystemAdmin(actor);
}

export function canAccessAdminPanel(actor: AuthContextValue) {
  return isSystemAdmin(actor) || actor.workspaceAdminGrants.length > 0 || actor.boardAdminGrants.length > 0;
}

export function canManageUserWorkspace(actor: AuthContextValue, workspaceId: string) {
  return canManageWorkspace(actor, workspaceId);
}

export function canManageUserBoard(db: Database.Database, actor: AuthContextValue, boardId: string) {
  return canManageBoard(db, actor, boardId);
}

export function canSetDefaultSelection(db: Database.Database, actor: AuthContextValue, workspaceId: string | null, boardId: string | null) {
  if (workspaceId === null) return boardId === null;
  return userHasAccessToWorkspace(db, actor.user.id, workspaceId, actor.user)
    && (boardId === null || userHasAccessToBoard(db, actor.user.id, boardId, workspaceId, actor.user));
}
