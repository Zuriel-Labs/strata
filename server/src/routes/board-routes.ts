import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { createBoard, createAuditEvent, updateBoardStarred, getBoardById } from '../db/repositories';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canManageWorkspace, canAccessBoard } from '../rbac/permissions';

const createBoardSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  color: z.string().min(1),
  labels: z.array(z.object({ id: z.string(), name: z.string(), color: z.string() })).optional(),
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

  return router;
}
