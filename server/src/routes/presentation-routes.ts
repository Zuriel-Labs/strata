import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { requireContentAuth as requireAuth, safeContentErrors, type AuthenticatedRequest } from '../http/auth-middleware';
import { boardContentAccessSql, canReadBoardContent, canReadWorkspaceContent, canManageUserBoard, canManageUserWorkspace } from '../rbac/policies';
import { buildSessionPayload, createAuditEvent, getBoardById, getListById, getWorkspaceById } from '../db/repositories';
import { isWorkspaceActive } from '../rbac/lifecycle';

export const nameSchema = z.object({ name: z.string().trim().min(1).max(200) }).strict();
export const revisionSchema = z.object({ expectedRevision: z.number().int().min(0) }).strict();
export const colorSchema = revisionSchema.extend({ color: z.enum(['#6366f1', '#0891b2', '#059669', '#ea580c', '#dc2626', '#7c3aed', '#be185d']).nullable() }).strict();
export const collectionQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().max(1000).optional() }).strict();
export const preferenceSchema = z.object({ collapsed: z.boolean() }).strict();

export function createPresentationRoutes(db: Database.Database) {
  const router = Router();
  router.get('/workspaces/:id/collections', requireAuth, (request: AuthenticatedRequest, response) => {
    const workspaceId = String(request.params.id);
    if (!getWorkspaceById(db, workspaceId) || !canReadWorkspaceContent(request.auth!, workspaceId)) { response.status(404).json({ message: 'Resource unavailable.' }); return; }
    const query = collectionQuerySchema.safeParse(request.query);
    if (!query.success) { response.status(400).json({ message: 'Invalid collection page.' }); return; }
    let afterId = '';
    if (query.data.cursor) {
      try {
        const cursor = z.object({ userId: z.string(), workspaceId: z.string(), id: z.string() }).strict().parse(JSON.parse(Buffer.from(query.data.cursor, 'base64url').toString()));
        if (cursor.userId !== request.auth!.user.id || cursor.workspaceId !== workspaceId) throw new Error('Invalid cursor scope.');
        afterId = cursor.id;
      } catch { response.status(400).json({ message: 'Invalid collection page.' }); return; }
    }
    const collections = db.prepare(`SELECT c.id, c.workspace_id AS workspaceId, c.name, c.revision FROM board_collections c
      WHERE c.workspace_id = @workspaceId AND c.id > @afterId AND (@manager = 1 OR EXISTS (
        SELECT 1 FROM board_collection_items i JOIN boards ON boards.id = i.board_id
        WHERE i.collection_id = c.id AND (@boardScope IS NULL OR boards.id IN (SELECT value FROM json_each(@boardScope))) AND ${boardContentAccessSql}))
      ORDER BY c.id LIMIT @limit`).all({ workspaceId, afterId, userId: request.auth!.user.id, manager: Number(canManageUserWorkspace(request.auth!, workspaceId)), limit: query.data.limit + 1, boardScope: request.auth!.credential ? JSON.stringify(buildSessionPayload(db, request.auth!.user, request.auth!).appState.boards.map(board => board.id)) : null }) as { id: string; workspaceId: string; name: string; revision: number }[];
    const visible = collections.slice(0, query.data.limit);
    const items = visible.map(collection => ({ ...collection, boardIds: (db.prepare('SELECT board_id AS id FROM board_collection_items WHERE collection_id = ? ORDER BY board_id').all(collection.id) as { id: string }[]).filter(board => canReadBoardContent(db, request.auth!, board.id)).map(board => board.id) }));
    const last = visible.at(-1);
    const nextCursor = collections.length > query.data.limit && last ? Buffer.from(JSON.stringify({ userId: request.auth!.user.id, workspaceId, id: last.id })).toString('base64url') : null;
    response.json({ items, nextCursor });
  });
  router.post('/workspaces/:id/collections', requireAuth, (request: AuthenticatedRequest, response) => {
    const workspaceId = String(request.params.id);
    const parsed = nameSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Enter a collection name.' }); return; }
    if (!getWorkspaceById(db, workspaceId) || !canReadWorkspaceContent(request.auth!, workspaceId)) { response.status(404).json({ message: 'Resource unavailable.' }); return; }
    if (!canManageUserWorkspace(request.auth!, workspaceId)) { response.status(403).json({ message: 'Workspace administrator permission required.' }); return; }
    if (db.prepare('SELECT 1 FROM board_collections WHERE workspace_id = ? AND name = ? COLLATE NOCASE').get(workspaceId, parsed.data.name)) { response.status(409).json({ message: 'This collection name already exists.' }); return; }
    const id = randomUUID();
    db.transaction(() => {
      db.prepare('INSERT INTO board_collections (id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)').run(id, workspaceId, parsed.data.name, new Date().toISOString());
      createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'workspace', scopeId: workspaceId, action: 'collection.create', outcome: 'success', metadata: { collectionId: id } });
    })();
    response.status(201).json({ id, workspaceId, name: parsed.data.name, revision: 0, boardIds: [] });
  });
  router.use('/collections/:id', requireAuth, (request: AuthenticatedRequest, response, next) => {
    const collection = db.prepare('SELECT workspace_id AS workspaceId FROM board_collections WHERE id = ?').get(String(request.params.id)) as { workspaceId: string } | undefined;
    if (!collection || !canReadWorkspaceContent(request.auth!, collection.workspaceId)) { response.status(404).json({ message: 'Resource unavailable.' }); return; }
    if (!canManageUserWorkspace(request.auth!, collection.workspaceId)) { response.status(403).json({ message: 'Workspace administrator permission required.' }); return; }
    if (!isWorkspaceActive(db, collection.workspaceId)) { response.status(409).json({ code: 'PARENT_INACTIVE', message: 'Reopen the workspace first.' }); return; }
    next();
  });
  router.patch('/collections/:id', (request: AuthenticatedRequest, response) => {
    const id = String(request.params.id);
    const parsed = nameSchema.extend({ expectedRevision: z.number().int().min(0) }).strict().safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Invalid collection settings.' }); return; }
    const collection = db.prepare('SELECT workspace_id AS workspaceId, revision FROM board_collections WHERE id = ?').get(id) as { workspaceId: string; revision: number };
    if (collection.revision !== parsed.data.expectedRevision) { response.status(409).json({ code: 'REVISION_CONFLICT', message: 'Collection changed. Refresh before saving.' }); return; }
    if (db.prepare('SELECT 1 FROM board_collections WHERE workspace_id = ? AND name = ? COLLATE NOCASE AND id != ?').get(collection.workspaceId, parsed.data.name, id)) { response.status(409).json({ message: 'This collection name already exists.' }); return; }
    db.transaction(() => {
      db.prepare('UPDATE board_collections SET name = ?, revision = revision + 1 WHERE id = ?').run(parsed.data.name, id);
      createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'workspace', scopeId: collection.workspaceId, action: 'collection.update', outcome: 'success', metadata: { collectionId: id } });
    })();
    response.json({ id, workspaceId: collection.workspaceId, name: parsed.data.name, revision: collection.revision + 1 });
  });
  router.delete('/collections/:id', (request: AuthenticatedRequest, response) => {
    const id = String(request.params.id);
    const parsed = revisionSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Current collection revision required.' }); return; }
    const collection = db.prepare('SELECT workspace_id AS workspaceId, revision FROM board_collections WHERE id = ?').get(id) as { workspaceId: string; revision: number };
    if (collection.revision !== parsed.data.expectedRevision) { response.status(409).json({ code: 'REVISION_CONFLICT', message: 'Collection changed. Refresh before deleting.' }); return; }
    db.transaction(() => {
      db.prepare('DELETE FROM board_collections WHERE id = ?').run(id);
      createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'workspace', scopeId: collection.workspaceId, action: 'collection.delete', outcome: 'success', metadata: { collectionId: id } });
    })();
    response.status(204).send();
  });
  for (const method of ['put', 'delete'] as const) router[method]('/collections/:id/boards/:boardId', (request: AuthenticatedRequest, response) => {
    const id = String(request.params.id), boardId = String(request.params.boardId);
    if (!z.object({}).strict().safeParse(request.body ?? {}).success) { response.status(400).json({ message: 'Invalid collection membership.' }); return; }
    const board = getBoardById(db, boardId);
    if (!board || !canReadBoardContent(db, request.auth!, boardId)) { response.status(404).json({ message: 'Resource unavailable.' }); return; }
    const collection = db.prepare('SELECT workspace_id AS workspaceId FROM board_collections WHERE id = ?').get(id) as { workspaceId: string };
    if (board.workspaceId !== collection.workspaceId) { response.status(400).json({ message: 'Collections can contain only boards in the same workspace.' }); return; }
    db.transaction(() => {
      const changed = method === 'put' ? db.prepare('INSERT OR IGNORE INTO board_collection_items VALUES (?, ?)').run(id, boardId).changes : db.prepare('DELETE FROM board_collection_items WHERE collection_id = ? AND board_id = ?').run(id, boardId).changes;
      if (!changed) return;
      db.prepare('UPDATE board_collections SET revision = revision + 1 WHERE id = ?').run(id);
      createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'workspace', scopeId: collection.workspaceId, action: 'collection.membership_update', outcome: 'success', metadata: { collectionId: id, boardId, included: method === 'put' } });
    })();
    response.status(204).send();
  });
  router.patch('/lists/:id/presentation', requireAuth, (request: AuthenticatedRequest, response) => {
    const id = String(request.params.id);
    const parsed = colorSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Choose a supported list color and current revision.' }); return; }
    const list = getListById(db, id);
    if (!list || !canReadBoardContent(db, request.auth!, list.boardId)) { response.status(404).json({ message: 'Resource unavailable.' }); return; }
    if (!canManageUserBoard(db, request.auth!, list.boardId)) { response.status(403).json({ message: 'Board administrator permission required.' }); return; }
    if (list.revision !== parsed.data.expectedRevision) { response.status(409).json({ code: 'REVISION_CONFLICT', message: 'List changed. Refresh before saving.' }); return; }
    db.transaction(() => {
      db.prepare('UPDATE lists SET color = ? WHERE id = ?').run(parsed.data.color, id);
      createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: list.boardId, action: 'list.presentation_update', outcome: 'success', metadata: { listId: id, color: parsed.data.color } });
    })();
    response.json(getListById(db, id));
  });
  router.put('/auth/list-preferences/:id', requireAuth, (request: AuthenticatedRequest, response) => {
    const id = String(request.params.id);
    const parsed = preferenceSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ message: 'Invalid list preference.' }); return; }
    const list = getListById(db, id);
    if (!list || !canReadBoardContent(db, request.auth!, list.boardId)) { response.status(404).json({ message: 'Resource unavailable.' }); return; }
    db.transaction(() => {
      db.prepare('INSERT INTO user_list_preferences (user_id, list_id, collapsed, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, list_id) DO UPDATE SET collapsed = excluded.collapsed, updated_at = excluded.updated_at')
        .run(request.auth!.user.id, id, Number(parsed.data.collapsed), new Date().toISOString());
      createAuditEvent(db, {actorUserId:request.auth!.user.id,scopeType:'board',scopeId:list.boardId,action:'auth.list_preference',outcome:'success',metadata:{listId:id,collapsed:parsed.data.collapsed}});
    })();
    response.json({ listId: id, collapsed: parsed.data.collapsed });
  });
  router.use(safeContentErrors);
  return router;
}
