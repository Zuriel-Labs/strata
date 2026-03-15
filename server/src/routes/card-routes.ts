import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { createCard, updateCard, deleteCard, getCardById, getMaxCardPosition, createAuditEvent, getBoardById } from '../db/repositories';
import { applyRealtimeAutomations, becameChecklistComplete } from '../automation/realtime';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canArchiveBoardContent, canEditBoardCards, canManageBoard } from '../rbac/permissions';

const createCardSchema = z.object({
  boardId: z.string().min(1),
  listId: z.string().min(1),
  title: z.string().min(1),
});

const updateCardSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  listId: z.string().optional(),
  position: z.number().optional(),
  memberIds: z.array(z.string()).optional(),
  labelIds: z.array(z.string()).optional(),
  checklists: z.array(z.unknown()).optional(),
  dueDate: z.string().nullable().optional(),
  dueDateComplete: z.boolean().optional(),
  comments: z.array(z.unknown()).optional(),
  activity: z.array(z.unknown()).optional(),
  attachments: z.array(z.unknown()).optional(),
  watching: z.boolean().optional(),
  archived: z.boolean().optional(),
});

const moveCardSchema = z.object({
  toListId: z.string().min(1),
  toPosition: z.number().int().min(0),
});

export function createCardRoutes(db: Database.Database) {
  const router = Router();

  const validateCardUpdates = (boardId: string, labelIds?: string[], listId?: string) => {
    const board = getBoardById(db, boardId);
    if (!board) return 'Board not found.';
    const validLabelIds = new Set(board.labels.map(label => label.id));
    if (labelIds && labelIds.some(labelId => !validLabelIds.has(labelId))) {
      return 'One or more labels do not belong to this board.';
    }
    if (listId) {
      const listExists = db.prepare('SELECT 1 FROM lists WHERE id = ? AND board_id = ?').get(listId, boardId);
      if (!listExists) return 'Selected list does not belong to this board.';
    }
    return null;
  };

  // Create card
  router.post('/', requireAuth, (request: AuthenticatedRequest, response) => {
    const parsed = createCardSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Invalid card payload.' });
      return;
    }
    if (!canManageBoard(db, request.auth!, parsed.data.boardId)) {
      response.status(403).json({ message: 'You do not have permission to add cards to this board.' });
      return;
    }
    const id = randomUUID();
    const position = getMaxCardPosition(db, parsed.data.listId) + 1;
    createCard(db, id, parsed.data.title, parsed.data.listId, parsed.data.boardId, position, request.auth!.user.id);
    createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: parsed.data.boardId, action: 'card.create', outcome: 'success' });
    const createdCard = getCardById(db, id);
    const card = createdCard ? applyRealtimeAutomations(db, createdCard, 'card_created', request.auth!.user.id) : null;
    response.status(201).json(card);
  });

  // Update card
  router.patch('/:cardId', requireAuth, (request: AuthenticatedRequest, response) => {
    const cardId = String(request.params.cardId);
    const card = getCardById(db, cardId);
    if (!card) { response.status(404).json({ message: 'Card not found.' }); return; }
    const parsed = updateCardSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Invalid payload.' }); return; }
    const requiresArchivePermission = parsed.data.archived !== undefined && parsed.data.archived !== card.archived;
    const canUpdate = requiresArchivePermission
      ? canArchiveBoardContent(db, request.auth!, card.boardId)
      : canEditBoardCards(db, request.auth!, card.boardId);
    if (!canUpdate) { response.status(403).json({ message: 'Access denied.' }); return; }
    const validationMessage = validateCardUpdates(card.boardId, parsed.data.labelIds, parsed.data.listId);
    if (validationMessage) {
      response.status(validationMessage === 'Board not found.' ? 404 : 400).json({ message: validationMessage });
      return;
    }
    const shouldRunChecklistAutomations = parsed.data.checklists !== undefined && becameChecklistComplete(card.checklists, parsed.data.checklists as typeof card.checklists);
    updateCard(db, cardId, parsed.data);
    if (requiresArchivePermission) {
      createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: card.boardId, action: parsed.data.archived ? 'card.archive' : 'card.restore', outcome: 'success' });
    }
    const updatedCard = getCardById(db, cardId);
    const updated = updatedCard && shouldRunChecklistAutomations
      ? applyRealtimeAutomations(db, updatedCard, 'checklist_complete', request.auth!.user.id)
      : updatedCard;
    response.json(updated);
  });

  // Move card
  router.post('/:cardId/move', requireAuth, (request: AuthenticatedRequest, response) => {
    const cardId = String(request.params.cardId);
    const card = getCardById(db, cardId);
    if (!card) { response.status(404).json({ message: 'Card not found.' }); return; }
    if (!canManageBoard(db, request.auth!, card.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    const parsed = moveCardSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Invalid payload.' }); return; }

    // Re-index cards in source and destination lists
    const sourceCards = (db.prepare('SELECT id FROM cards WHERE list_id = ? AND archived = 0 AND id != ? ORDER BY position ASC').all(card.listId, card.id) as Array<{ id: string }>);
    for (let i = 0; i < sourceCards.length; i++) {
      db.prepare('UPDATE cards SET position = ? WHERE id = ?').run(i, sourceCards[i].id);
    }

    const destCards = card.listId === parsed.data.toListId
      ? sourceCards
      : (db.prepare('SELECT id FROM cards WHERE list_id = ? AND archived = 0 ORDER BY position ASC').all(parsed.data.toListId) as Array<{ id: string }>);

    const insertAt = Math.max(0, Math.min(parsed.data.toPosition, destCards.length));
    const reordered = [...destCards];
    reordered.splice(insertAt, 0, { id: card.id });
    for (let i = 0; i < reordered.length; i++) {
      db.prepare('UPDATE cards SET position = ? WHERE id = ?').run(i, reordered[i].id);
    }

    db.prepare('UPDATE cards SET list_id = ? WHERE id = ?').run(parsed.data.toListId, card.id);

    const movedCard = getCardById(db, cardId);
    const updated = movedCard ? applyRealtimeAutomations(db, movedCard, 'card_moved', request.auth!.user.id, { toListId: parsed.data.toListId }) : null;
    response.json(updated);
  });

  // Delete card
  router.delete('/:cardId', requireAuth, (request: AuthenticatedRequest, response) => {
    const cardId = String(request.params.cardId);
    const card = getCardById(db, cardId);
    if (!card) { response.status(404).json({ message: 'Card not found.' }); return; }
    if (!canManageBoard(db, request.auth!, card.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    deleteCard(db, cardId);
    createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: card.boardId, action: 'card.delete', outcome: 'success' });
    response.status(204).send();
  });

  return router;
}
