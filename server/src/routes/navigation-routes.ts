import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canUsePersonalBoardNavigation } from '../rbac/policies';
import { setPersonalBoardStar } from '../db/navigation-repositories';

const boardParams = z.object({ boardId: z.string().min(1).max(100) }).strict();
const starBody = z.object({ starred: z.boolean() }).strict();

export function createNavigationRoutes(db: Database.Database) {
  const router = Router();
  router.use(requireAuth);
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
