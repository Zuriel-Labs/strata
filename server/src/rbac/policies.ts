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

export function canManageBoardInvitations(db: Database.Database, actor: AuthContextValue, boardId: string) {
  return actor.user.active && !actor.user.mustChangePassword
    && Boolean(db.prepare('SELECT 1 FROM boards WHERE id = ?').get(boardId))
    && canManageUserBoard(db, actor, boardId);
}

export function canAcceptBoardInvitations(actor: AuthContextValue) {
  return actor.user.active && !actor.user.mustChangePassword;
}

export const invitationIssuerAuthoritySql = `EXISTS (SELECT 1 FROM users issuer
  JOIN boards scope_board ON scope_board.id = board_invitations.board_id
  WHERE issuer.id = board_invitations.issuer_user_id AND issuer.active = 1 AND (
    issuer.platform_role = 'system_admin'
    OR EXISTS (SELECT 1 FROM board_admin_grants g WHERE g.user_id = issuer.id AND g.board_id = scope_board.id)
    OR EXISTS (SELECT 1 FROM workspace_admin_grants g WHERE g.user_id = issuer.id AND g.workspace_id = scope_board.workspace_id)))`;

// Applied before pagination so inaccessible references cannot disclose metadata or consume a page.
export const personalNavigationAccessSql = `EXISTS (SELECT 1 FROM users actor
  WHERE actor.id = @userId AND actor.active = 1 AND actor.must_change_password = 0 AND (
    actor.platform_role = 'system_admin'
    OR EXISTS (SELECT 1 FROM board_memberships m WHERE m.user_id = actor.id AND m.board_id = boards.id)
    OR EXISTS (SELECT 1 FROM board_admin_grants g WHERE g.user_id = actor.id AND g.board_id = boards.id)
    OR EXISTS (SELECT 1 FROM workspace_admin_grants g WHERE g.user_id = actor.id AND g.workspace_id = boards.workspace_id)))`;

export function canUsePersonalBoardNavigation(db: Database.Database, actor: AuthContextValue, boardId: string) {
  return Boolean(db.prepare(`SELECT 1 FROM boards WHERE boards.id = @boardId AND ${personalNavigationAccessSql}`)
    .get({ userId: actor.user.id, boardId }));
}

export function canSetDefaultSelection(db: Database.Database, actor: AuthContextValue, workspaceId: string | null, boardId: string | null) {
  if (workspaceId === null) return boardId === null;
  return userHasAccessToWorkspace(db, actor.user.id, workspaceId, actor.user)
    && (boardId === null || userHasAccessToBoard(db, actor.user.id, boardId, workspaceId, actor.user));
}
