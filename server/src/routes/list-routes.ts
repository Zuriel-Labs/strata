import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { createList, updateList, archiveList, restoreList, moveList, getListById, getMaxListPosition, createAuditEvent } from '../db/repositories';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canManageBoard } from '../rbac/permissions';

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
    createList(db, id, parsed.data.title, parsed.data.boardId, position);
    createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: parsed.data.boardId, action: 'list.create', outcome: 'success' });
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
    updateList(db, listId, parsed.data.title);
    response.json({ ...list, title: parsed.data.title });
  });

  // Archive list
  router.post('/:listId/archive', requireAuth, (request: AuthenticatedRequest, response) => {
    const listId = String(request.params.listId);
    const list = getListById(db, listId);
    if (!list) { response.status(404).json({ message: 'List not found.' }); return; }
    if (!canManageBoard(db, request.auth!, list.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    archiveList(db, listId);
    response.json({ success: true });
  });

  // Restore list
  router.post('/:listId/restore', requireAuth, (request: AuthenticatedRequest, response) => {
    const listId = String(request.params.listId);
    const list = getListById(db, listId);
    if (!list) { response.status(404).json({ message: 'List not found.' }); return; }
    if (!canManageBoard(db, request.auth!, list.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    restoreList(db, listId);
    response.json({ success: true });
  });

  // Move list
  router.post('/:listId/move', requireAuth, (request: AuthenticatedRequest, response) => {
    const listId = String(request.params.listId);
    const list = getListById(db, listId);
    if (!list) { response.status(404).json({ message: 'List not found.' }); return; }
    if (!canManageBoard(db, request.auth!, list.boardId)) { response.status(403).json({ message: 'Access denied.' }); return; }
    const parsed = moveListSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Invalid payload.' }); return; }
    moveList(db, listId, list.boardId, parsed.data.toPosition);
    response.json({ success: true });
  });

  return router;
}
