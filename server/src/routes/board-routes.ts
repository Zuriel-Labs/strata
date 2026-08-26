import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { createBoard, createAuditEvent, updateBoardStarred, getBoardById, getMaxLabelsPerBoard, updateBoardLabels, updateBoardTitle } from '../db/repositories';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canManageWorkspace, canAccessBoard, canManageBoard, canManageBoardLabels } from '../rbac/permissions';

const labelSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().max(50).transform(value => value.trim()),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).transform(value => value.toLowerCase()),
}).strict();

const labelsSchema = z.array(labelSchema).max(100).superRefine((labels, context) => {
  const seen = new Set<string>();
  labels.forEach((label, index) => {
    if (seen.has(label.id)) {
      context.addIssue({ code: 'custom', message: 'Label IDs must be unique.', path: [index, 'id'] });
    }
    seen.add(label.id);
  });
});

const createBoardSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1),
  color: z.string().min(1),
  labels: labelsSchema.optional(),
}).strict();

const updateBoardSchema = z.object({
  title: z.string().transform(value => value.trim()).refine(value => value.length > 0),
});

const updateBoardLabelsSchema = z.object({
  labels: labelsSchema,
  expectedRevision: z.number().int().min(0),
}).strict();

function labelCollection(board: NonNullable<ReturnType<typeof getBoardById>>, maxLabelsPerBoard: number) {
  return { boardId: board.id, labels: board.labels, labelsRevision: board.labelsRevision, maxLabelsPerBoard };
}

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
    const maxLabelsPerBoard = getMaxLabelsPerBoard(db);
    const labels = parsed.data.labels ?? [
      { id: randomUUID(), name: 'Urgent', color: '#ef4444' },
      { id: randomUUID(), name: 'Feature', color: '#a855f7' },
      { id: randomUUID(), name: 'Bug', color: '#f97316' },
    ].slice(0, maxLabelsPerBoard);
    if (labels.length > maxLabelsPerBoard) {
      response.status(409).json({ code: 'LABEL_LIMIT_EXCEEDED', message: `Boards can have at most ${maxLabelsPerBoard} labels.`, details: { maxLabelsPerBoard, currentLabelCount: 0 } });
      return;
    }
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
      response.status(400).json({ code: 'LABEL_DEFINITION_INVALID', message: 'Invalid label payload.', details: { issues: parsed.error.issues.map(issue => ({ path: issue.path, message: issue.message })) } });
      return;
    }

    const maxLabelsPerBoard = getMaxLabelsPerBoard(db);
    if (parsed.data.expectedRevision !== board.labelsRevision) {
      response.status(409).json({ code: 'LABEL_VERSION_CONFLICT', message: 'Board labels changed since this editor was opened. Reload the current labels before saving again.', details: labelCollection(board, maxLabelsPerBoard) });
      return;
    }

    const currentIds = new Set(board.labels.map(label => label.id));
    const addsNewIdentity = parsed.data.labels.some(label => !currentIds.has(label.id));
    if (addsNewIdentity && (board.labels.length >= maxLabelsPerBoard || parsed.data.labels.length > maxLabelsPerBoard)) {
      response.status(409).json({ code: 'LABEL_LIMIT_EXCEEDED', message: `This Board has reached its limit of ${maxLabelsPerBoard} labels. Existing labels can still be renamed, recolored, or deleted.`, details: { maxLabelsPerBoard, currentLabelCount: board.labels.length } });
      return;
    }

    const updated = db.transaction(() => {
      const nextBoard = updateBoardLabels(db, boardId, parsed.data.labels, parsed.data.expectedRevision);
      if (!nextBoard) return null;
      createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: boardId, action: 'board.labels.update', outcome: 'success' });
      return nextBoard;
    })();
    if (!updated) {
      const current = getBoardById(db, boardId);
      response.status(409).json({ code: 'LABEL_VERSION_CONFLICT', message: 'Board labels changed since this editor was opened. Reload the current labels before saving again.', details: current ? labelCollection(current, maxLabelsPerBoard) : { maxLabelsPerBoard } });
      return;
    }
    response.json(labelCollection(updated, maxLabelsPerBoard));
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
