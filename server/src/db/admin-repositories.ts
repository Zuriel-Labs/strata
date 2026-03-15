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

export interface DeleteManagedUserResult {
  deletedUserId: string;
  username: string;
  removedCardAssignments: number;
  remediatedAutomationRules: number;
}

function removeUserFromCardMemberships(db: Database.Database, userId: string) {
  const rows = db.prepare('SELECT id, member_ids_json FROM cards').all() as Array<{ id: string; member_ids_json: string }>;
  const updateCardMembers = db.prepare('UPDATE cards SET member_ids_json = ? WHERE id = ?');
  let removedAssignments = 0;

  for (const row of rows) {
    const memberIds = JSON.parse(row.member_ids_json) as string[];
    if (!memberIds.includes(userId)) continue;
    const nextMemberIds = memberIds.filter(memberId => memberId !== userId);
    removedAssignments += memberIds.length - nextMemberIds.length;
    updateCardMembers.run(JSON.stringify(nextMemberIds), row.id);
  }

  return removedAssignments;
}

function remediateAutomationAssignments(db: Database.Database, userId: string) {
  const rows = db.prepare("SELECT id, action_config_json FROM automation_rules WHERE action = 'assign_member'").all() as Array<{ id: string; action_config_json: string }>;
  const updateRule = db.prepare('UPDATE automation_rules SET action_config_json = ?, enabled = 0 WHERE id = ?');
  let remediatedRules = 0;

  for (const row of rows) {
    const actionConfig = JSON.parse(row.action_config_json) as Record<string, string>;
    if (actionConfig.memberId !== userId) continue;
    const nextActionConfig = { ...actionConfig };
    delete nextActionConfig.memberId;
    updateRule.run(JSON.stringify(nextActionConfig), row.id);
    remediatedRules += 1;
  }

  return remediatedRules;
}

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

export function deleteManagedUser(db: Database.Database, actor: UserRecord, userId: string): DeleteManagedUserResult | null {
  const current = getUserById(db, userId);
  if (!current) return null;
  if (actor.id === userId) {
    throw new Error('Cannot delete the currently authenticated user.');
  }
  if (current.platformRole === 'system_admin' && current.active && countSystemAdmins(db) <= 1) {
    throw new Error('Cannot delete the last remaining system administrator.');
  }

  const deleteUserTransaction = db.transaction(() => {
    const removedCardAssignments = removeUserFromCardMemberships(db, userId);
    const remediatedAutomationRules = remediateAutomationAssignments(db, userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    createAuditEvent(db, {
      actorUserId: actor.id,
      targetUserId: userId,
      scopeType: 'platform',
      action: 'user.delete',
      outcome: 'success',
      metadata: {
        username: current.username,
        removedCardAssignments,
        remediatedAutomationRules,
      },
    });

    return {
      deletedUserId: userId,
      username: current.username,
      removedCardAssignments,
      remediatedAutomationRules,
    } satisfies DeleteManagedUserResult;
  });

  return deleteUserTransaction();
}
