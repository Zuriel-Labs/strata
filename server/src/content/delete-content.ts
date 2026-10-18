import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { boardAudience, cleanupResourceContexts, disableListReferences } from './move-content';
import type { OperationInput } from './operation-contract';
import type { ResolvedOperation } from './operation-plan';

export function deletionImpact(db: Database.Database, plan: ResolvedOperation) {
  const sum = (table: string, column: string, ids: string[]) => ids.reduce((count, id) => count + Number(db.prepare(`SELECT COUNT(*) FROM ${table} WHERE ${column} = ?`).pluck().get(id)), 0);
  const deletesBoards = plan.resourceType === 'workspace' || plan.resourceType === 'board';
  const boardIds = deletesBoards ? plan.boardIds : [];
  return {
    notifications: sum('notifications', 'card_id', plan.cards.map(card => card.id)),
    automations: sum('automation_rules', 'board_id', boardIds),
    collectionMemberships: sum('board_collection_items', 'board_id', boardIds),
    personalListPreferences: sum('user_list_preferences', 'list_id', plan.lists.map(list => list.id)),
    workspaceAdminGrants: plan.resourceType === 'workspace' ? sum('workspace_admin_grants', 'workspace_id', [plan.sourceWorkspace.id]) : 0,
    collections: plan.resourceType === 'workspace' ? sum('board_collections', 'workspace_id', [plan.sourceWorkspace.id]) : 0,
    invitations: sum('board_invitations', 'board_id', boardIds),
    memberships: sum('board_memberships', 'board_id', boardIds),
    boardAdminGrants: sum('board_admin_grants', 'board_id', boardIds),
    navigationEntries: sum('user_board_navigation', 'board_id', boardIds),
    defaultBoardReferences: sum('users', 'default_board_id', boardIds),
    defaultWorkspaceReferences: plan.resourceType === 'workspace' ? sum('users', 'default_workspace_id', [plan.sourceWorkspace.id]) : 0,
    auditEventsPreserved: sum('audit_events', 'scope_id', [...boardIds, ...(plan.resourceType === 'workspace' ? [plan.sourceWorkspace.id] : [])]),
  };
}

export function deleteContent(db: Database.Database, actorId: string, operationId: string, input: OperationInput, plan: ResolvedOperation) {
  const affectedUsers = new Set<string>([actorId]);
  if (plan.resourceType === 'workspace') {
    const users = db.prepare("SELECT u.id FROM users u WHERE u.platform_role = 'system_admin' OR EXISTS (SELECT 1 FROM workspace_admin_grants g WHERE g.user_id = u.id AND g.workspace_id = ?)").all(plan.sourceWorkspace.id) as { id: string }[];
    users.forEach(user => affectedUsers.add(user.id));
  }
  for (const boardId of plan.boardIds) {
    const workspaceId = String(db.prepare('SELECT workspace_id FROM boards WHERE id = ?').pluck().get(boardId));
    boardAudience(db, boardId, workspaceId).forEach(user => affectedUsers.add(user.id));
  }
  const rows = plan.resourceType === 'workspace'
    ? db.prepare('SELECT id FROM users WHERE default_workspace_id = ?').all(plan.sourceWorkspace.id)
    : db.prepare('SELECT id FROM users WHERE default_board_id = ?').all(plan.sourceBoard?.id ?? '');
  (rows as { id: string }[]).forEach(user => affectedUsers.add(user.id));
  for (const card of plan.cards) db.prepare('DELETE FROM notifications WHERE card_id = ?').run(card.id);
  if (plan.resourceType === 'list' && plan.sourceList && plan.sourceBoard) disableListReferences(db, plan.sourceBoard.id, plan.sourceList.id, actorId);
  const tombstoneId = randomUUID();
  db.prepare('INSERT INTO lifecycle_tombstones (id, resource_type, resource_id, actor_user_id, operation_id, deleted_at, counts_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(tombstoneId, plan.resourceType, input.sourceId, actorId, operationId, new Date().toISOString(), JSON.stringify(plan.counts));
  const table = { workspace: 'workspaces', board: 'boards', list: 'lists', card: 'cards' }[plan.resourceType as 'workspace' | 'board' | 'list' | 'card'];
  if (!table) throw new Error('Unknown deletion resource.');
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(input.sourceId);
  cleanupResourceContexts(db, affectedUsers);
  return { resultIds: [], createdCardIds: [], tombstoneId, sessionsInvalidated: true };
}
