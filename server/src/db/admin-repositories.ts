import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { countSystemAdmins, createAuditEvent, getUserById, listUsers } from './repositories';
import type { BoardMembershipRecord, PlatformRole, UserRecord, WorkspaceMembershipRecord } from '../types';

type UserInput = {
  name: string;
  initials: string;
  color: string;
  username: string;
  platformRole: PlatformRole;
  passwordHash: string;
  mustChangePassword: boolean;
  active: boolean;
};

type MembershipInput = {
  workspaceMemberships: Array<{ workspaceId: string; role: WorkspaceMembershipRecord['role'] }>;
  boardMemberships: Array<{ boardId: string; role: BoardMembershipRecord['role'] }>;
};

export function listAdminUsers(db: Database.Database) {
  return listUsers(db).map(user => ({
    id: user.id,
    name: user.name,
    initials: user.initials,
    color: user.color,
    username: user.username,
    platformRole: user.platformRole,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }));
}

export function createManagedUser(db: Database.Database, actor: UserRecord, input: UserInput & MembershipInput) {
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  db.prepare(`
    INSERT INTO users (id, name, initials, color, username, platform_role, password_hash, active, must_change_password, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.name,
    input.initials,
    input.color,
    input.username,
    input.platformRole,
    input.passwordHash,
    input.active ? 1 : 0,
    input.mustChangePassword ? 1 : 0,
    timestamp,
    timestamp,
  );
  replaceMemberships(db, id, input);
  createAuditEvent(db, { actorUserId: actor.id, targetUserId: id, scopeType: 'platform', action: 'user.create', outcome: 'success' });
  return getUserById(db, id);
}

export function replaceMemberships(db: Database.Database, userId: string, input: MembershipInput) {
  db.prepare('DELETE FROM workspace_memberships WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM board_memberships WHERE user_id = ?').run(userId);
  const createdAt = new Date().toISOString();
  const workspaceStatement = db.prepare('INSERT INTO workspace_memberships (id, user_id, workspace_id, role, created_at) VALUES (?, ?, ?, ?, ?)');
  const boardStatement = db.prepare('INSERT INTO board_memberships (id, user_id, board_id, role, created_at) VALUES (?, ?, ?, ?, ?)');
  for (const membership of input.workspaceMemberships) {
    workspaceStatement.run(randomUUID(), userId, membership.workspaceId, membership.role, createdAt);
  }
  for (const membership of input.boardMemberships) {
    boardStatement.run(randomUUID(), userId, membership.boardId, membership.role, createdAt);
  }
}

export function updateManagedUser(db: Database.Database, actor: UserRecord, userId: string, input: Partial<UserInput> & Partial<MembershipInput>) {
  const current = getUserById(db, userId);
  if (!current) return null;
  if (current.platformRole === 'system_admin' && input.platformRole === 'user' && countSystemAdmins(db) <= 1) {
    throw new Error('Cannot remove the last remaining system administrator.');
  }
  if (current.platformRole === 'system_admin' && input.active === false && countSystemAdmins(db) <= 1) {
    throw new Error('Cannot deactivate the last remaining system administrator.');
  }
  db.prepare(`
    UPDATE users
    SET name = ?, initials = ?, color = ?, username = ?, platform_role = ?, active = ?, must_change_password = ?, updated_at = ?
    WHERE id = ?
  `).run(
    input.name ?? current.name,
    input.initials ?? current.initials,
    input.color ?? current.color,
    input.username ?? current.username,
    input.platformRole ?? current.platformRole,
    input.active === undefined ? (current.active ? 1 : 0) : input.active ? 1 : 0,
    input.mustChangePassword === undefined ? (current.mustChangePassword ? 1 : 0) : input.mustChangePassword ? 1 : 0,
    new Date().toISOString(),
    userId,
  );
  if (input.workspaceMemberships || input.boardMemberships) {
    replaceMemberships(db, userId, {
      workspaceMemberships: input.workspaceMemberships ?? [],
      boardMemberships: input.boardMemberships ?? [],
    });
  }
  createAuditEvent(db, { actorUserId: actor.id, targetUserId: userId, scopeType: 'platform', action: 'user.update', outcome: 'success' });
  return getUserById(db, userId);
}
