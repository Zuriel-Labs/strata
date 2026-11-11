import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import type { AuthenticatedRequest } from '../http/auth-middleware';
import { buildSessionPayload, createAuditEvent } from '../db/repositories';
import { revokeGrant } from './credentials';

const pageSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().max(2000).optional(), boardId: z.string().max(200).optional(), workspaceId: z.string().max(200).optional() }).strict();
export function createApiReadRoutes(db: Database.Database) {
  const router = Router();
  const payload = (request: AuthenticatedRequest) => buildSessionPayload(db, request.auth!.user, request.auth!);
  router.get('/me', (request: AuthenticatedRequest, response) => {
    const { user, permissions } = payload(request);
    response.json({ user, permissions });
  });
  for (const route of ['/state','/auth/session','/workspaces/bootstrap']) router.get(route, (request: AuthenticatedRequest, response) => response.json(payload(request)));
  for (const [path, key] of [['workspaces','workspaces'],['boards','boards'],['lists','lists'],['cards','cards'],['automation-rules','automationRules'],['notifications','notifications']] as const) {
    router.get(`/${path}`, (request: AuthenticatedRequest, response) => {
      const parsed = pageSchema.safeParse(request.query);
      if (!parsed.success) { response.status(400).json({ code: 'PAGE_INVALID', message: 'Use limit 1–100 and a valid cursor.' }); return; }
      const query = parsed.data;
      let after = '';
      if (query.cursor) {
        try {
          const value = z.object({ id: z.string(), credentialId: z.string(), path: z.literal(path), boardId: z.string().optional(), workspaceId: z.string().optional() }).strict().parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString()));
          if (value.credentialId !== request.auth!.credential!.id || value.boardId !== query.boardId || value.workspaceId !== query.workspaceId) throw new Error('Cursor scope mismatch.');
          after = value.id;
        } catch { response.status(400).json({ code: 'PAGE_INVALID', message: 'Invalid cursor for this collection.' }); return; }
      }
      const state = payload(request).appState;
      const rows = state[key].filter(item => item.id > after && (!query.boardId || ('boardId' in item && item.boardId === query.boardId)) && (!query.workspaceId || (('workspaceId' in item && item.workspaceId === query.workspaceId) || ('boardId' in item && state.boards.some(board => board.id === item.boardId && board.workspaceId === query.workspaceId)))))
        .sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const items = rows.slice(0, query.limit);
      const last = items.at(-1);
      response.json({ items, nextCursor: rows.length > query.limit && last ? Buffer.from(JSON.stringify({ id: last.id, credentialId: request.auth!.credential!.id, path, boardId: query.boardId, workspaceId: query.workspaceId })).toString('base64url') : null });
    });
    router.get(`/${path}/:id`, (request: AuthenticatedRequest, response) => {
      const item = payload(request).appState[key].find(item => item.id === request.params.id);
      if (!item) { response.status(404).json({ code: 'RESOURCE_UNAVAILABLE', message: 'Resource unavailable.' }); return; }
      response.json(item);
    });
  }
  router.post('/auth/logout', (request: AuthenticatedRequest, response) => {
    db.transaction(() => revokeGrant(db, request.auth!.credential!, 'client_logout'))();
    response.status(204).send();
  });
  router.post('/notifications/read-all', (request: AuthenticatedRequest, response) => {
    const notifications = payload(request).appState.notifications;
    db.transaction(() => {
      for (const item of notifications) db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(item.id, request.auth!.user.id);
      createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'auth', action: 'notification.read_all', outcome: 'success' });
    })();
    response.status(204).send();
  });
  return router;
}
