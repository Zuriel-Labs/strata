import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { createList, updateList, archiveList, restoreList, moveList, sortListCards, getListById, getMaxListPosition, createAuditEvent } from '../db/repositories';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canArchiveBoardContent, canManageBoard } from '../rbac/permissions';

const createListSchema = z.object({
  boardId: z.string().min(1),
  title: z.string().min(1),
});

const updateListSchema = z.object({
  title: z.string().min(1),
});

const moveListSchema = z.object({
  toPosition: z.number().int().min(0),
});

const sortListSchema = z.object({
  direction: z.enum(['asc', 'desc']),
}).strict();

export function createListRoutes(db: Database.Database) {
  const router = Router();

  // Create list
  router.post('/', requireAuth, (request: AuthenticatedRequest, response) => {
    const parsed = createListSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Invalid list payload.' });
      return;
    }
    if (!canManageBoard(db, request.auth!, parsed.data.boardId)) {
      response.status(403).json({ message: 'You do not have permission to add lists to this board.' });
      return;
    }
    const id = randomUUID();
    const position = getMaxListPosition(db, parsed.data.boardId) + 1;
    db.transaction(() => {
      createList(db, id, parsed.data.title, parsed.data.boardId, position);
      createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: parsed.data.boardId, action: 'list.create', outcome: 'success' });
    })();
    response.status(201).json({ id, title: parsed.data.title, boardId: parsed.data.boardId, position, archived: false });
  });

  // Update list title
  router.patch('/:listId', requireAuth, (request: AuthenticatedRequest, response) => {
    const listId = String(request.params.listId);
    const list = getListById(db, listId);
    if (!list) { response.status(404).json({ message: 'List not found.' }); return; }
    if (!canManageBoard(db, request.auth!, list.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    const parsed = updateListSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Invalid payload.' }); return; }
    db.transaction(() => {
      updateList(db, listId, parsed.data.title);
      createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: list.boardId, action: 'list.update', outcome: 'success' });
    })();
    response.json(getListById(db, listId));
  });

  // Sort active cards in a list
  router.post('/:listId/sort', requireAuth, (request: AuthenticatedRequest, response) => {
    const listId = String(request.params.listId);
    const list = getListById(db, listId);
    if (!list) { response.status(404).json({ message: 'List not found.' }); return; }
    if (list.archived) { response.status(400).json({ message: 'Archived lists cannot be sorted.' }); return; }
    if (!canManageBoard(db, request.auth!, list.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    const parsed = sortListSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Invalid sort payload.' }); return; }

    try {
      const cards = sortListCards(db, list, parsed.data.direction, request.auth!.user.id);
      response.json({ listId, direction: parsed.data.direction, cards });
    } catch {
      response.status(500).json({ message: 'Unable to sort list.' });
    }
  });

  // Archive list
  router.post('/:listId/archive', requireAuth, (request: AuthenticatedRequest, response) => {
    const listId = String(request.params.listId);
    const list = getListById(db, listId);
    if (!list) { response.status(404).json({ message: 'List not found.' }); return; }
    if (!canArchiveBoardContent(db, request.auth!, list.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    if (!list.archived) db.transaction(() => {
      archiveList(db, listId);
      createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: list.boardId, action: 'list.archive', outcome: 'success' });
    })();
    response.json({ success: true });
  });

  // Restore list
  router.post('/:listId/restore', requireAuth, (request: AuthenticatedRequest, response) => {
    const listId = String(request.params.listId);
    const list = getListById(db, listId);
    if (!list) { response.status(404).json({ message: 'List not found.' }); return; }
    if (!canArchiveBoardContent(db, request.auth!, list.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    if (list.archived) db.transaction(() => {
      restoreList(db, listId);
      createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: list.boardId, action: 'list.restore', outcome: 'success' });
    })();
    response.json({ success: true });
  });

  // Permanently delete an archived list and its child cards.
  router.delete('/:listId', requireAuth, (request: AuthenticatedRequest, response) => {
    const listId = String(request.params.listId);
    const list = getListById(db, listId);
    if (!list) { response.status(404).json({ message: 'List not found.' }); return; }
    if (!canArchiveBoardContent(db, request.auth!, list.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    if (!list.archived) { response.status(400).json({ message: 'Only archived lists can be permanently deleted.' }); return; }

    response.status(409).json({ code: 'PREVIEW_REQUIRED', message: 'Use a fresh content-operation preview and typed confirmation for permanent deletion.' });
  });

  // Move list
  router.post('/:listId/move', requireAuth, (request: AuthenticatedRequest, response) => {
    const listId = String(request.params.listId);
    const list = getListById(db, listId);
    if (!list) { response.status(404).json({ message: 'List not found.' }); return; }
    if (!canManageBoard(db, request.auth!, list.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    const parsed = moveListSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Invalid payload.' }); return; }
    db.transaction(() => {
      moveList(db, listId, list.boardId, parsed.data.toPosition);
      createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: list.boardId, action: 'list.move', outcome: 'success' });
    })();
    response.json({ success: true });
  });

  return router;
}
