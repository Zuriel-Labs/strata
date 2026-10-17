import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canUsePersonalBoardNavigation } from '../rbac/policies';
import { listPersonalBoardNavigation, recordPersonalBoardVisit, setPersonalBoardStar } from '../db/navigation-repositories';

const boardParams = z.object({ boardId: z.string().min(1).max(100) }).strict();
const starBody = z.object({ starred: z.boolean() }).strict();
const navigationQuery = z.object({
  kind: z.enum(['recent', 'starred']), limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();
const cursorSchema = z.object({ userId: z.string(), kind: z.enum(['recent', 'starred']), timestamp: z.iso.datetime(), boardId: z.string().min(1).max(100) }).strict();

export function createNavigationRoutes(db: Database.Database) {
  const router = Router();
  router.use(requireAuth);
  router.put('/boards/:boardId/visit', (request: AuthenticatedRequest, response) => {
    const actor = request.auth;
    if (!actor) return;
    const params = boardParams.safeParse(request.params);
    if (!params.success || !z.object({}).strict().safeParse(request.body ?? {}).success) {
      response.status(400).json({ code: 'NAVIGATION_INVALID', message: 'Invalid navigation request.' });
      return;
    }
    if (!canUsePersonalBoardNavigation(db, actor, params.data.boardId)) {
      response.status(404).json({ code: 'DESTINATION_UNAVAILABLE', message: 'Destination unavailable.' });
      return;
    }
    recordPersonalBoardVisit(db, actor.user.id, params.data.boardId);
    response.status(204).send();
  });
  router.get('/', (request: AuthenticatedRequest, response) => {
    const actor = request.auth;
    if (!actor) return;
    const parsed = navigationQuery.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ code: 'NAVIGATION_INVALID', message: 'Invalid navigation request.' });
      return;
    }
    let cursor;
    if (parsed.data.cursor) {
      try {
        const decoded = Buffer.from(parsed.data.cursor, 'base64url');
        cursor = cursorSchema.parse(JSON.parse(decoded.toString('utf8')));
        if (decoded.toString('base64url') !== parsed.data.cursor || cursor.userId !== actor.user.id || cursor.kind !== parsed.data.kind) throw new Error('Invalid cursor');
      } catch {
        response.status(400).json({ code: 'NAVIGATION_INVALID', message: 'Invalid navigation request.' });
        return;
      }
    }
    response.set('Cache-Control', 'no-store').json(listPersonalBoardNavigation(db, actor.user.id, parsed.data.kind, parsed.data.limit, cursor));
  });
  router.put('/boards/:boardId/star', (request: AuthenticatedRequest, response) => {
    const actor = request.auth;
    if (!actor) return;
    const params = boardParams.safeParse(request.params);
    const body = starBody.safeParse(request.body);
    if (!params.success || !body.success) {
      response.status(400).json({ code: 'NAVIGATION_INVALID', message: 'Invalid navigation request.' });
      return;
    }
    if (!canUsePersonalBoardNavigation(db, actor, params.data.boardId)) {
      response.status(404).json({ code: 'DESTINATION_UNAVAILABLE', message: 'Destination unavailable.' });
      return;
    }
    setPersonalBoardStar(db, actor.user.id, params.data.boardId, body.data.starred);
    response.json({ boardId: params.data.boardId, starred: body.data.starred });
  });
  return router;
}
