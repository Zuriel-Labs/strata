import { createHash, createHmac, randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Board, Card, List } from '../../../src/types';
import type { AuthContextValue } from '../types';
import { canReadBoardContent as canAccessBoard, canReadWorkspaceContent as canAccessWorkspace, canManageUserBoard as canManageBoard, canManageUserWorkspace as canManageWorkspace, canEditUserBoardCards as canEditBoardCards } from '../rbac/policies';
import { isBoardActive, isListActive, isWorkspaceActive } from '../rbac/lifecycle';
import { getBoardById, getCardById, getListById, getWorkspaceById, getMaxLabelsPerBoard } from '../db/repositories';
import { ContentOperationError, conflict, unavailable, type OperationInput } from './operation-contract';
import { transferAudience } from './move-content';
import { deletionImpact } from './delete-content';

const planSecret = randomBytes(32);
export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const signature = (actorId: string, input: OperationInput, fingerprint: string, expiry: number) =>
  createHmac('sha256', planSecret).update(JSON.stringify([actorId, input, fingerprint, expiry])).digest('hex');

export function resolveOperation(db: Database.Database, actor: AuthContextValue, input: OperationInput, replay = false) {
  const resourceType = input.kind === 'delete' ? input.resourceType : input.kind.split('_')[0];
  if (!resourceType) throw new ContentOperationError(400, 'INPUT_INVALID', 'Choose a resource type.');
  const sourceCard = resourceType === 'card' ? getCardById(db, input.sourceId) : null;
  const sourceList = resourceType === 'list' ? getListById(db, input.sourceId) : sourceCard ? getListById(db, sourceCard.listId) : null;
  const sourceBoard = resourceType === 'board' ? getBoardById(db, input.sourceId) : sourceList ? getBoardById(db, sourceList.boardId) : null;
  const sourceWorkspace = getWorkspaceById(db, resourceType === 'workspace' ? input.sourceId : sourceBoard?.workspaceId ?? '');
  const source = resourceType === 'card' ? sourceCard : resourceType === 'list' ? sourceList : resourceType === 'board' ? sourceBoard : sourceWorkspace;
  if (!source || !sourceWorkspace || !(sourceBoard ? canAccessBoard(db, actor, sourceBoard.id) : canAccessWorkspace(actor, sourceWorkspace.id))) unavailable();
  const isCopy = input.kind.endsWith('_copy');
  const isMove = input.kind.endsWith('_move');
  if (!isCopy && !(sourceBoard ? (resourceType === 'card' ? canEditBoardCards(db, actor, sourceBoard.id) : canManageBoard(db, actor, sourceBoard.id)) : canManageWorkspace(actor, sourceWorkspace.id))) {
    throw new ContentOperationError(403, 'ACTION_FORBIDDEN', 'Administrator permission required.');
  }
  if (input.kind === 'delete' && sourceBoard && !canManageBoard(db, actor, sourceBoard.id)) throw new ContentOperationError(403, 'ACTION_FORBIDDEN', 'Administrator permission required.');
  let destinationBoard: Board | null = null;
  let destinationList: List | null = null;
  let destinationWorkspace = null as ReturnType<typeof getWorkspaceById>;
  if (isCopy || isMove) {
    if (resourceType === 'board') {
      if (!input.destinationWorkspaceId) throw new ContentOperationError(400, 'INPUT_INVALID', 'Choose a destination workspace.');
      destinationWorkspace = getWorkspaceById(db, input.destinationWorkspaceId);
      if (!destinationWorkspace || !canAccessWorkspace(actor, destinationWorkspace.id)) unavailable();
      if (!canManageWorkspace(actor, destinationWorkspace.id) || (isMove && !canManageWorkspace(actor, sourceWorkspace.id))) throw new ContentOperationError(403, 'ACTION_FORBIDDEN', 'Both workspace administration permissions are required for transfer.');
    } else {
      if (resourceType === 'card') {
        if (!input.destinationListId) throw new ContentOperationError(400, 'INPUT_INVALID', 'Choose a destination list.');
        destinationList = getListById(db, input.destinationListId);
        destinationBoard = destinationList ? getBoardById(db, destinationList.boardId) : null;
      } else destinationBoard = input.destinationBoardId ? getBoardById(db, input.destinationBoardId) : null;
      if (!destinationBoard || !canAccessBoard(db, actor, destinationBoard.id)) unavailable();
      if (!(resourceType === 'card' ? canEditBoardCards(db, actor, destinationBoard.id) : canManageBoard(db, actor, destinationBoard.id))) throw new ContentOperationError(403, 'ACTION_FORBIDDEN', 'Destination permission required.');
      destinationWorkspace = getWorkspaceById(db, destinationBoard.workspaceId);
    }
  }
  if (input.destinationBoardId && resourceType === 'card' && input.destinationBoardId !== destinationBoard?.id) throw new ContentOperationError(400, 'INPUT_INVALID', 'Destination list must belong to the selected board.');
  if (resourceType === 'card' && isCopy && !input.keep.cards) throw new ContentOperationError(400, 'INPUT_INVALID', 'A card copy must include the card.');
  if (!replay && input.kind === 'board_move' && destinationWorkspace?.id === sourceWorkspace.id) throw new ContentOperationError(400, 'INPUT_INVALID', 'Choose a different destination workspace.');
  if (!replay) {
    if (input.kind === 'delete') {
      const inactive = sourceCard ? sourceCard.archived : sourceList ? sourceList.archived : (sourceBoard ?? sourceWorkspace).lifecycleState === 'closed';
      if (!inactive) conflict('PARENT_INACTIVE', 'Archive or close this resource before permanent deletion.');
    } else {
      if (!isWorkspaceActive(db, sourceWorkspace.id) || (sourceBoard && !isBoardActive(db, sourceBoard.id)) || sourceList?.archived || sourceCard?.archived) conflict('PARENT_INACTIVE', 'Restore or reopen the source first.');
      if (!destinationWorkspace || !isWorkspaceActive(db, destinationWorkspace.id) || (destinationBoard && !isBoardActive(db, destinationBoard.id)) || (destinationList && !isListActive(db, destinationList.id))) conflict('PARENT_INACTIVE', 'Choose an active destination.');
    }
  }
  const boardIds = sourceBoard ? [sourceBoard.id] : (db.prepare('SELECT id FROM boards WHERE workspace_id = ? ORDER BY id').all(sourceWorkspace.id) as { id: string }[]).map(row => row.id);
  const lists: List[] = sourceList ? [sourceList] : boardIds.flatMap(boardId => (db.prepare('SELECT id FROM lists WHERE board_id = ? ORDER BY position, id').all(boardId) as { id: string }[]).map(row => getListById(db, row.id)!));
  const cards: Card[] = sourceCard ? [sourceCard] : lists.flatMap(list => (db.prepare('SELECT id FROM cards WHERE list_id = ? ORDER BY position, id').all(list.id) as { id: string }[]).map(row => getCardById(db, row.id)!));
  const selectedLists = isCopy ? lists.filter(list => !list.archived) : lists;
  const selectedCards = isCopy ? cards.filter(card => input.keep.cards && !card.archived && selectedLists.some(list => list.id === card.listId)) : cards;
  if (isCopy && input.keep.attachments && selectedCards.some(card => card.attachments.length)) conflict('ATTACHMENT_CONTRACT_UNAVAILABLE', 'Attachment reference ownership is not available yet. Turn off attachment copying.');
  if (input.fieldMap.length) conflict('MAPPING_REQUIRED', 'Custom field ownership is not available.');
  if (resourceType === 'board' && isCopy && input.keep.labels && (sourceBoard?.labels.length ?? 0) > getMaxLabelsPerBoard(db)) conflict('LABEL_LIMIT_EXCEEDED', 'Source labels exceed the current board label limit.');
  const unresolvedMappings: { kind: 'label' | 'member'; sourceId: string }[] = [];
  if (destinationBoard) {
    const crossesBoard = destinationBoard.id !== sourceBoard?.id;
    const labelIds = new Set(destinationBoard.labels.map(label => label.id));
    const members = new Set((db.prepare("SELECT m.user_id AS id FROM board_memberships m JOIN users u ON u.id = m.user_id WHERE m.board_id = ? AND m.role = 'member' AND u.active = 1").all(destinationBoard.id) as { id: string }[]).map(row => row.id));
    for (const sourceId of new Set(selectedCards.flatMap(card => crossesBoard && (input.keep.labels || isMove) ? card.labelIds : []))) {
      const entry = input.labelMap.find(item => item.sourceId === sourceId);
      if (!entry || (entry.destinationId !== null && !labelIds.has(entry.destinationId))) unresolvedMappings.push({ kind: 'label', sourceId });
    }
    for (const sourceId of new Set(selectedCards.flatMap(card => crossesBoard && isMove ? card.memberIds : []))) {
      const entry = input.memberMap.find(item => item.sourceId === sourceId);
      if (!entry || (entry.destinationId !== null && !members.has(entry.destinationId))) unresolvedMappings.push({ kind: 'member', sourceId });
    }
    if (input.memberMap.some(entry => entry.destinationId !== null && !members.has(entry.destinationId))) conflict('MAPPING_REQUIRED', 'A mapped member is not an active destination Member.');
    if (input.labelMap.some(entry => entry.destinationId !== null && !labelIds.has(entry.destinationId))) conflict('MAPPING_REQUIRED', 'A mapped label is not in the destination board.');
  }
  const counts: Record<string, number> = { workspaces: resourceType === 'workspace' ? 1 : 0, boards: resourceType === 'workspace' ? boardIds.length : resourceType === 'board' ? 1 : 0, lists: resourceType === 'card' ? 0 : selectedLists.length, cards: selectedCards.length, attachmentReferences: selectedCards.reduce((count, card) => count + card.attachments.length, 0) };
  return { resourceType, source, sourceWorkspace, sourceBoard, sourceList, sourceCard, destinationWorkspace, destinationBoard, destinationList, lists: selectedLists, cards: selectedCards, boardIds, isCopy, isMove, counts, unresolvedMappings };
}

export type ResolvedOperation = ReturnType<typeof resolveOperation>;

export function operationFingerprint(db: Database.Database, plan: ResolvedOperation) {
  const workspaceIds = [...new Set([plan.sourceWorkspace.id, plan.destinationWorkspace?.id].filter((id): id is string => Boolean(id)))].sort();
  const data = workspaceIds.map(workspaceId => {
    const boards = db.prepare('SELECT * FROM boards WHERE workspace_id = ? AND (? = 1 OR id IN (SELECT value FROM json_each(?))) ORDER BY id').all(workspaceId, Number(plan.resourceType === 'workspace'), JSON.stringify([plan.sourceBoard?.id, plan.destinationBoard?.id].filter(Boolean))) as { id: string }[];
    return {
      workspace: db.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId),
      grants: db.prepare('SELECT * FROM workspace_admin_grants WHERE workspace_id = ? ORDER BY id').all(workspaceId),
      collections: db.prepare('SELECT * FROM board_collections WHERE workspace_id = ? ORDER BY id').all(workspaceId),
      boards: boards.map(board => ({
        board,
        ...Object.fromEntries(['lists', 'cards', 'automation_rules', 'board_memberships', 'board_admin_grants', 'board_invitations', 'user_board_navigation', 'notifications'].map(table => [table, db.prepare(`SELECT * FROM ${table} WHERE board_id = ? ORDER BY rowid`).all(board.id)])),
        collectionItems: db.prepare('SELECT * FROM board_collection_items WHERE board_id = ? ORDER BY collection_id').all(board.id),
      })),
    };
  });
  // Account state and defaults affect audience, assignment validation and reference cleanup.
  const users = db.prepare('SELECT id, name, active, platform_role, must_change_password, default_workspace_id, default_board_id FROM users ORDER BY id').all();
  return hash([data, users, getMaxLabelsPerBoard(db), plan.resourceType === 'workspace' ? db.prepare('SELECT * FROM workspace_memberships WHERE workspace_id = ? ORDER BY id').all(plan.sourceWorkspace.id) : [], !plan.isCopy && !plan.isMove ? deletionImpact(db, plan) : null]);
}

export function previewOperation(db: Database.Database, actor: AuthContextValue, input: OperationInput) {
  const plan = resolveOperation(db, actor, input);
  if (input.kind === 'delete') Object.assign(plan.counts, deletionImpact(db, plan));
  const expiry = Date.now() + 5 * 60_000;
  const planHash = `${expiry}.${signature(actor.user.id, input, operationFingerprint(db, plan), expiry)}`;
  return { planHash, sourceRevision: plan.source.revision ?? 0, destinationRevision: plan.destinationBoard?.revision ?? plan.destinationWorkspace?.revision ?? null, counts: plan.counts, warnings: plan.isCopy ? ['Copies do not inherit people, invitations, history, stars or automation rules.'] : input.kind === 'delete' ? ['Permanent deletion cannot be undone. Accounts, existing audit history and all shared attachment bytes are preserved.'] : [], unresolvedMappings: plan.unresolvedMappings, audience: input.kind === 'board_move' ? transferAudience(db, plan) : undefined, expiresAt: new Date(expiry).toISOString() };
}

export function verifyPlan(db: Database.Database, actor: AuthContextValue, input: OperationInput, planHash: string, plan: ResolvedOperation) {
  const [expiryText, supplied] = planHash.split('.');
  const expiry = Number(expiryText);
  if (!Number.isSafeInteger(expiry) || expiry <= Date.now() || expiry > Date.now() + 5 * 60_000) conflict('PLAN_EXPIRED', 'Preview expired. Review a fresh preview.');
  if (supplied !== signature(actor.user.id, input, operationFingerprint(db, plan), expiry)) conflict('REVISION_CONFLICT', 'Content or access changed. Review a fresh preview.');
  if (plan.unresolvedMappings.length) conflict('MAPPING_REQUIRED', 'Resolve every label and member mapping before continuing.');
}
