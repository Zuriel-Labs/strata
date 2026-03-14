import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { createCard, updateCard, deleteCard, getCardById, getMaxCardPosition, createAuditEvent } from '../db/repositories';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canManageBoard } from '../rbac/permissions';

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
    const card = getCardById(db, id);
    response.status(201).json(card);
  });

  // Update card
  router.patch('/:cardId', requireAuth, (request: AuthenticatedRequest, response) => {
    const cardId = String(request.params.cardId);
    const card = getCardById(db, cardId);
    if (!card) { response.status(404).json({ message: 'Card not found.' }); return; }
    if (!canManageBoard(db, request.auth!, card.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    const parsed = updateCardSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Invalid payload.' }); return; }
    updateCard(db, cardId, parsed.data);
    const updated = getCardById(db, cardId);
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

    const updated = getCardById(db, cardId);
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
