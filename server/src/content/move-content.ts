import type Database from 'better-sqlite3';
import { createAuditEvent, getCardById, getUserById, userHasAccessToBoard, userHasAccessToWorkspace, updateCard } from '../db/repositories';
import { invitationIssuerAuthoritySql, personalNavigationAccessSql } from '../rbac/policies';
import { applyRealtimeAutomations } from '../automation/realtime';
import { reindex } from './copy-content';
import type { OperationInput } from './operation-contract';
import type { ResolvedOperation } from './operation-plan';

export function boardAudience(db: Database.Database, boardId: string, workspaceId: string) {
  return db.prepare(`SELECT u.id, u.name,
    (u.platform_role = 'system_admin'
      OR EXISTS (SELECT 1 FROM workspace_admin_grants g WHERE g.user_id = u.id AND g.workspace_id = @workspaceId)
      OR EXISTS (SELECT 1 FROM board_admin_grants g WHERE g.user_id = u.id AND g.board_id = @boardId)) AS admin
    FROM users u WHERE u.active = 1 AND u.must_change_password = 0 AND
      (u.platform_role = 'system_admin'
      OR EXISTS (SELECT 1 FROM workspace_admin_grants g WHERE g.user_id = u.id AND g.workspace_id = @workspaceId)
      OR EXISTS (SELECT 1 FROM board_admin_grants g WHERE g.user_id = u.id AND g.board_id = @boardId)
      OR EXISTS (SELECT 1 FROM board_memberships m WHERE m.user_id = u.id AND m.board_id = @boardId))
    ORDER BY u.id`).all({ boardId, workspaceId }) as { id: string; name: string; admin: number }[];
}

export function transferAudience(db: Database.Database, plan: ResolvedOperation) {
  if (!plan.sourceBoard || !plan.destinationWorkspace) return undefined;
  const before = boardAudience(db, plan.sourceBoard.id, plan.sourceWorkspace.id);
  const after = boardAudience(db, plan.sourceBoard.id, plan.destinationWorkspace.id);
  return {
    readersGained: after.filter(user => !before.some(previous => previous.id === user.id)),
    readersLost: before.filter(user => !after.some(next => next.id === user.id)),
    administratorsGained: after.filter(user => user.admin && !before.some(previous => previous.id === user.id && previous.admin)),
    administratorsLost: before.filter(user => user.admin && !after.some(next => next.id === user.id && next.admin)),
  };
}

export function cleanupResourceContexts(db: Database.Database, affectedUserIds: Set<string>) {
  for (const userId of affectedUserIds) {
    const user = getUserById(db, userId);
    if (!user) continue;
    let workspaceId = user.defaultWorkspaceId;
    let boardId = user.defaultBoardId;
    if (workspaceId && !userHasAccessToWorkspace(db, userId, workspaceId, user)) { workspaceId = null; boardId = null; }
    if (boardId && (!workspaceId || !userHasAccessToBoard(db, userId, boardId, workspaceId, user))) boardId = null;
    db.prepare('UPDATE users SET default_workspace_id = ?, default_board_id = ? WHERE id = ?').run(workspaceId, boardId, userId);
    db.prepare(`DELETE FROM user_board_navigation WHERE user_id = @userId AND board_id NOT IN
      (SELECT boards.id FROM boards WHERE ${personalNavigationAccessSql})`).run({ userId });
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }
}

export function disableListReferences(db: Database.Database, boardId: string, listId: string, actorId: string) {
  const rules = db.prepare(`SELECT id FROM automation_rules WHERE board_id = ? AND
    (json_extract(trigger_config_json, '$.toListId') = ? OR json_extract(conditions_json, '$.listId') = ? OR json_extract(action_config_json, '$.listId') = ?)`)
    .all(boardId, listId, listId, listId) as { id: string }[];
  for (const rule of rules) {
    db.prepare("UPDATE automation_rules SET enabled = 0, trigger_config_json = json_remove(trigger_config_json, '$.toListId'), conditions_json = json_set(conditions_json, '$.listId', NULL), action_config_json = json_remove(action_config_json, '$.listId') WHERE id = ?").run(rule.id);
    createAuditEvent(db, { actorUserId: actorId, scopeType: 'board', scopeId: boardId, action: 'automation.reference_detached', outcome: 'success', metadata: { ruleId: rule.id, listId } });
  }
}

export function moveContent(db: Database.Database, actorId: string, operationId: string, input: OperationInput, plan: ResolvedOperation) {
  if (plan.resourceType === 'board' && plan.sourceBoard && plan.destinationWorkspace) {
    const affectedUsers = new Set([...boardAudience(db, plan.sourceBoard.id, plan.sourceWorkspace.id), ...boardAudience(db, plan.sourceBoard.id, plan.destinationWorkspace.id)].map(user => user.id));
    for (const row of db.prepare('SELECT id FROM users WHERE default_board_id = ?').all(plan.sourceBoard.id) as { id: string }[]) affectedUsers.add(row.id);
    db.prepare('DELETE FROM board_collection_items WHERE board_id = ?').run(plan.sourceBoard.id);
    db.prepare('UPDATE boards SET workspace_id = ? WHERE id = ?').run(plan.destinationWorkspace.id, plan.sourceBoard.id);
    db.prepare(`UPDATE board_invitations SET revoked_at = ?, revocation_reason = 'issuer_authority_lost'
      WHERE board_id = ? AND revoked_at IS NULL AND NOT ${invitationIssuerAuthoritySql}`).run(new Date().toISOString(), plan.sourceBoard.id);
    cleanupResourceContexts(db, affectedUsers);
    return { resultIds: [plan.sourceBoard.id], createdCardIds: [], sessionsInvalidated: true };
  }
  if (!plan.destinationBoard || !plan.sourceBoard) throw new Error('Move board unavailable.');
  const destinationBoardId = plan.destinationBoard.id;
  const crossesBoard = destinationBoardId !== plan.sourceBoard.id;
  if (plan.resourceType === 'list' && plan.sourceList) {
    if (crossesBoard) disableListReferences(db, plan.sourceBoard.id, plan.sourceList.id, actorId);
    db.prepare('UPDATE lists SET board_id = ? WHERE id = ?').run(destinationBoardId, plan.sourceList.id);
    reindex(db, 'lists', 'board_id', plan.sourceBoard.id);
    reindex(db, 'lists', 'board_id', destinationBoardId, plan.sourceList.id, input.position);
  }
  const touchedLists = new Set<string>();
  for (const card of plan.cards) {
    const listId = plan.resourceType === 'card' ? plan.destinationList?.id : card.listId;
    if (!listId) throw new Error('Move list unavailable.');
    touchedLists.add(card.listId); touchedLists.add(listId);
    const mapped = (ids: string[], map: OperationInput['labelMap']) => [...new Set(ids.flatMap(id => {
      const entry = map.find(item => item.sourceId === id); return entry?.destinationId ? [entry.destinationId] : [];
    }))];
    db.prepare('UPDATE cards SET board_id = ?, list_id = ? WHERE id = ?').run(destinationBoardId, listId, card.id);
    if (crossesBoard) {
      updateCard(db, card.id, { labelIds: mapped(card.labelIds, input.labelMap), memberIds: mapped(card.memberIds, input.memberMap), watching: false });
      db.prepare('DELETE FROM notifications WHERE card_id = ?').run(card.id);
    }
    if (!card.archived) {
      reindex(db, 'cards', 'list_id', listId, card.id, plan.resourceType === 'card' ? input.position : card.position);
      const moved = getCardById(db, card.id);
      if (!moved) throw new Error('Moved card unavailable.');
      const final = applyRealtimeAutomations(db, moved, 'card_moved', actorId, { toListId: listId }, operationId);
      touchedLists.add(final.listId);
    }
  }
  for (const listId of touchedLists) reindex(db, 'cards', 'list_id', listId);
  return { resultIds: [input.sourceId], createdCardIds: [], sessionsInvalidated: false };
}
