import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { compactActivePositions, CardDuplicateValidationError, CardMoveValidationError, createCard, updateCard, duplicateCard, getCardById, getMaxCardPosition, createAuditEvent, getBoardById, moveCard } from '../db/repositories';
import { applyRealtimeAutomations, becameChecklistComplete } from '../automation/realtime';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canArchiveBoardContent, canEditBoardCards, canManageBoard } from '../rbac/permissions';
import { normalizeDescriptionInput, RichTextValidationError } from '../../../src/lib/rich-text';

const createCardSchema = z.object({
  boardId: z.string().min(1),
  listId: z.string().min(1),
  title: z.string().min(1),
});

const checklistItemSchema = z.object({
  id: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(1_000),
  completed: z.boolean(),
}).strict();

const checklistSchema = z.object({
  id: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  items: z.array(checklistItemSchema).max(500),
}).strict();

const updateCardSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  descriptionDocument: z.unknown().optional(),
  memberIds: z.array(z.string()).optional(),
  labelIds: z.array(z.string()).optional(),
  checklists: z.array(checklistSchema).max(100).optional(),
  dueDate: z.string().nullable().optional(),
  dueDateComplete: z.boolean().optional(),
  attachments: z.array(z.unknown()).optional(),
  watching: z.boolean().optional(),
  archived: z.boolean().optional(),
}).strict().refine(value => !(value.description !== undefined && value.descriptionDocument !== undefined));

const moveCardSchema = z.object({
  toListId: z.string().min(1),
  toPosition: z.number().int().min(0),
}).strict();

const duplicateCardSchema = z.object({}).strict();

const commentMutationSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
}).strict();

export function createCardRoutes(db: Database.Database) {
  const router = Router();

  const validateCardUpdates = (boardId: string, labelIds?: string[], memberIds?: string[]) => {
    const board = getBoardById(db, boardId);
    if (!board) return 'Board not found.';
    const validLabelIds = new Set(board.labels.map(label => label.id));
    if (labelIds && labelIds.some(labelId => !validLabelIds.has(labelId))) {
      return 'One or more labels do not belong to this board.';
    }
    if (memberIds) {
      if (new Set(memberIds).size !== memberIds.length) return 'Card members cannot contain duplicates.';
      if (memberIds.length > 0) {
        const placeholders = memberIds.map(() => '?').join(', ');
        const count = Number((db.prepare(`SELECT COUNT(*) AS count FROM board_memberships JOIN users ON users.id = board_memberships.user_id WHERE board_memberships.board_id = ? AND board_memberships.role = 'member' AND users.active = 1 AND board_memberships.user_id IN (${placeholders})`).get(boardId, ...memberIds) as { count: number }).count);
        if (count !== memberIds.length) return 'One or more selected people are not active members of this board.';
      }
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
    if (!canEditBoardCards(db, request.auth!, parsed.data.boardId)) {
      response.status(403).json({ message: 'You do not have permission to add cards to this board.' });
      return;
    }
    const listExists = db.prepare('SELECT 1 FROM lists WHERE id = ? AND board_id = ? AND archived = 0').get(parsed.data.listId, parsed.data.boardId);
    if (!listExists) {
      response.status(400).json({ message: 'Selected list does not belong to this board.' });
      return;
    }
    const id = randomUUID();
    const position = getMaxCardPosition(db, parsed.data.listId) + 1;
    const card = db.transaction(() => {
      createCard(db, id, parsed.data.title, parsed.data.listId, parsed.data.boardId, position, request.auth!.user.id);
      createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: parsed.data.boardId, action: 'card.create', outcome: 'success' });
      const createdCard = getCardById(db, id);
      return createdCard ? applyRealtimeAutomations(db, createdCard, 'card_created', request.auth!.user.id) : null;
    })();
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
    const validationMessage = validateCardUpdates(card.boardId, parsed.data.labelIds, parsed.data.memberIds);
    if (validationMessage) {
      response.status(validationMessage === 'Board not found.' ? 404 : 400).json({ message: validationMessage });
      return;
    }
    let updates: Record<string, unknown> = parsed.data;
    try {
      const normalizedDescription = normalizeDescriptionInput(parsed.data);
      if (normalizedDescription) {
        updates = { ...parsed.data };
        delete updates.description;
        delete updates.descriptionDocument;
        updates.descriptionDocument = normalizedDescription.descriptionDocument;
      }
    } catch (error) {
      if (error instanceof RichTextValidationError) {
        response.status(400).json({ message: error.message });
        return;
      }
      throw error;
    }
    const shouldRunChecklistAutomations = parsed.data.checklists !== undefined && becameChecklistComplete(card.checklists, parsed.data.checklists as typeof card.checklists);
    const updated = db.transaction(() => {
      updateCard(db, cardId, requiresArchivePermission && parsed.data.archived === false ? { ...updates, position: getMaxCardPosition(db, card.listId) + 1 } : updates);
      if (requiresArchivePermission) {
        db.prepare('UPDATE cards SET archived_by_list_id = NULL WHERE id = ?').run(cardId);
        if (parsed.data.archived === false) compactActivePositions(db, 'cards', 'list_id', card.listId);
        createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: card.boardId, action: parsed.data.archived ? 'card.archive' : 'card.restore', outcome: 'success' });
      }
      const updatedCard = getCardById(db, cardId);
      return updatedCard && shouldRunChecklistAutomations
        ? applyRealtimeAutomations(db, updatedCard, 'checklist_complete', request.auth!.user.id)
        : updatedCard;
    })();
    response.json(updated);
  });

  // Move card
  router.post('/:cardId/move', requireAuth, (request: AuthenticatedRequest, response) => {
    const cardId = String(request.params.cardId);
    const card = getCardById(db, cardId);
    if (!card) { response.status(404).json({ message: 'Card not found.' }); return; }
    if (!canEditBoardCards(db, request.auth!, card.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    const parsed = moveCardSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Invalid payload.' }); return; }

    let movedCard;
    try {
      movedCard = db.transaction(() => {
        const moved = moveCard(db, card, parsed.data.toListId, parsed.data.toPosition, request.auth!.user.id);
        return moved ? applyRealtimeAutomations(db, moved, 'card_moved', request.auth!.user.id, { toListId: parsed.data.toListId }) : null;
      })();
    } catch (error) {
      if (error instanceof CardMoveValidationError) {
        response.status(400).json({ message: error.message });
        return;
      }
      response.status(500).json({ message: 'Unable to move card.' });
      return;
    }
    response.json(movedCard);
  });

  // Duplicate an active card and its reusable content as one atomic operation.
  router.post('/:cardId/duplicate', requireAuth, (request: AuthenticatedRequest, response) => {
    const cardId = String(request.params.cardId);
    const source = getCardById(db, cardId);
    if (!source) { response.status(404).json({ message: 'Card not found.' }); return; }
    if (!canEditBoardCards(db, request.auth!, source.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    if (!duplicateCardSchema.safeParse(request.body ?? {}).success) { response.status(400).json({ message: 'Invalid payload.' }); return; }

    try {
      const duplicate = duplicateCard(
        db,
        source,
        request.auth!.user.id,
        created => applyRealtimeAutomations(db, created, 'card_created', request.auth!.user.id),
      );
      response.status(201).json(duplicate);
    } catch (error) {
      if (error instanceof CardDuplicateValidationError) {
        response.status(400).json({ message: error.message });
        return;
      }
      response.status(500).json({ message: 'Unable to duplicate card.' });
    }
  });

  router.post('/:cardId/comments', requireAuth, (request: AuthenticatedRequest, response) => {
    const card = getCardById(db, String(request.params.cardId));
    if (!card) { response.status(404).json({ message: 'Card not found.' }); return; }
    if (!canEditBoardCards(db, request.auth!, card.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    const parsed = commentMutationSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Invalid comment payload.' }); return; }

    const now = new Date().toISOString();
    const comment = { id: randomUUID(), userId: request.auth!.user.id, text: parsed.data.text, createdAt: now };
    const activity = [...card.activity, { id: randomUUID(), userId: request.auth!.user.id, action: 'commented on this card', createdAt: now }];
    db.transaction(() => {
      updateCard(db, card.id, { comments: [...card.comments, comment], activity, watching: true });
      createAuditEvent(db, {
        actorUserId: request.auth!.user.id,
        scopeType: 'board',
        scopeId: card.boardId,
        action: 'card.comment.create',
        outcome: 'success',
        metadata: { cardId: card.id, commentId: comment.id },
      });
    })();
    response.status(201).json(getCardById(db, card.id));
  });

  router.patch('/:cardId/comments/:commentId', requireAuth, (request: AuthenticatedRequest, response) => {
    const card = getCardById(db, String(request.params.cardId));
    if (!card) { response.status(404).json({ message: 'Card not found.' }); return; }
    if (!canEditBoardCards(db, request.auth!, card.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    const parsed = commentMutationSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Invalid comment payload.' }); return; }

    const commentId = String(request.params.commentId);
    const comment = card.comments.find(entry => entry.id === commentId);
    if (!comment) { response.status(404).json({ message: 'Comment not found.' }); return; }
    if (comment.userId !== request.auth!.user.id) { response.status(403).json({ message: 'You can edit only your own comments.' }); return; }

    const comments = card.comments.map(entry => entry.id === commentId ? { ...entry, text: parsed.data.text } : entry);
    db.transaction(() => {
      updateCard(db, card.id, { comments });
      createAuditEvent(db, {
        actorUserId: request.auth!.user.id,
        scopeType: 'board',
        scopeId: card.boardId,
        action: 'card.comment.update',
        outcome: 'success',
        metadata: { cardId: card.id, commentId },
      });
    })();
    response.json(getCardById(db, card.id));
  });

  router.delete('/:cardId/comments/:commentId', requireAuth, (request: AuthenticatedRequest, response) => {
    const card = getCardById(db, String(request.params.cardId));
    if (!card) { response.status(404).json({ message: 'Card not found.' }); return; }
    if (!canManageBoard(db, request.auth!, card.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }

    const commentId = String(request.params.commentId);
    if (!card.comments.some(entry => entry.id === commentId)) { response.status(404).json({ message: 'Comment not found.' }); return; }
    const comments = card.comments.filter(entry => entry.id !== commentId);
    db.transaction(() => {
      updateCard(db, card.id, { comments });
      createAuditEvent(db, {
        actorUserId: request.auth!.user.id,
        scopeType: 'board',
        scopeId: card.boardId,
        action: 'card.comment.delete',
        outcome: 'success',
        metadata: { cardId: card.id, commentId },
      });
    })();
    response.json(getCardById(db, card.id));
  });

  // Delete card
  router.delete('/:cardId', requireAuth, (request: AuthenticatedRequest, response) => {
    const cardId = String(request.params.cardId);
    const card = getCardById(db, cardId);
    if (!card) { response.status(404).json({ message: 'Card not found.' }); return; }
    if (!canManageBoard(db, request.auth!, card.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    response.status(409).json({ code: 'PREVIEW_REQUIRED', message: 'Use a fresh content-operation preview and typed confirmation for permanent deletion.' });
  });

  return router;
}
