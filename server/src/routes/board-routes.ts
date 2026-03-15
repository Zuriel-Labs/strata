import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { createBoard, createAuditEvent, updateBoardStarred, getBoardById, updateBoardLabels, updateBoardTitle } from '../db/repositories';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canManageWorkspace, canAccessBoard, canManageBoard, canManageBoardLabels } from '../rbac/permissions';

const labelSchema = z.object({
  id: z.string().min(1),
  name: z.string().transform(value => value.trim()),
  color: z.string().min(1),
});

const createBoardSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  color: z.string().min(1),
  labels: z.array(labelSchema).optional(),
});

const updateBoardSchema = z.object({
  title: z.string().transform(value => value.trim()).refine(value => value.length > 0),
});

const updateBoardLabelsSchema = z.object({
  labels: z.array(labelSchema),
});

export function createBoardRoutes(db: Database.Database) {
  const router = Router();

  // Create board
  router.post('/', requireAuth, (request: AuthenticatedRequest, response) => {
    const parsed = createBoardSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Invalid board payload.' });
      return;
    }
    if (!canManageWorkspace(request.auth!, parsed.data.workspaceId)) {
      response.status(403).json({ message: 'You do not have permission to create boards in this workspace.' });
      return;
    }
    const id = randomUUID();
    const labels = parsed.data.labels ?? [
      { id: randomUUID(), name: 'Urgent', color: '#ef4444' },
      { id: randomUUID(), name: 'Feature', color: '#a855f7' },
      { id: randomUUID(), name: 'Bug', color: '#f97316' },
    ];
    createBoard(db, id, parsed.data.title, parsed.data.workspaceId, 'workspace', parsed.data.color, JSON.stringify(labels));
    createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: id, action: 'board.create', outcome: 'success' });

    const board = getBoardById(db, id);
    response.status(201).json(board);
  });

  // Toggle star
  router.patch('/:boardId/star', requireAuth, (request: AuthenticatedRequest, response) => {
    const { boardId } = request.params;
    if (!canAccessBoard(db, request.auth!, boardId as string)) {
      response.status(403).json({ message: 'Access denied.' });
      return;
    }
    const board = getBoardById(db, boardId as string);
    if (!board) {
      response.status(404).json({ message: 'Board not found.' });
      return;
    }
    updateBoardStarred(db, boardId as string, !board.starred);
    response.json({ starred: !board.starred });
  });

  router.put('/:boardId/labels', requireAuth, (request: AuthenticatedRequest, response) => {
    const boardId = String(request.params.boardId);
    const board = getBoardById(db, boardId);
    if (!board) {
      response.status(404).json({ message: 'Board not found.' });
      return;
    }
    if (!canManageBoardLabels(db, request.auth!, boardId)) {
      response.status(403).json({ message: 'Access denied.' });
      return;
    }
    const parsed = updateBoardLabelsSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Invalid label payload.' });
      return;
    }

    updateBoardLabels(db, boardId, parsed.data.labels);
    createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: boardId, action: 'board.labels.update', outcome: 'success' });
    response.json({ boardId, labels: parsed.data.labels });
  });

  router.patch('/:boardId', requireAuth, (request: AuthenticatedRequest, response) => {
    const boardId = String(request.params.boardId);
    const board = getBoardById(db, boardId);
    if (!board) {
      response.status(404).json({ message: 'Board not found.' });
      return;
    }
    if (!canManageBoard(db, request.auth!, boardId)) {
      response.status(403).json({ message: 'Access denied.' });
      return;
    }

    const parsed = updateBoardSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Invalid board payload.' });
      return;
    }

    updateBoardTitle(db, boardId, parsed.data.title);
    createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: boardId, action: 'board.update', outcome: 'success' });
    response.json({ ...board, title: parsed.data.title });
  });

  router.delete('/:boardId', requireAuth, (request: AuthenticatedRequest, response) => {
    const boardId = String(request.params.boardId);
    const board = getBoardById(db, boardId);
    if (!board) {
      response.status(404).json({ message: 'Board not found.' });
      return;
    }
    if (!canManageBoard(db, request.auth!, boardId)) {
      response.status(403).json({ message: 'Access denied.' });
      return;
    }

    db.prepare('DELETE FROM boards WHERE id = ?').run(boardId);
    createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: boardId, action: 'board.delete', outcome: 'success' });
    response.json({ success: true });
  });

  return router;
}
