import { Router } from 'express';
import type Database from 'better-sqlite3';
import { buildSessionPayload } from '../db/repositories';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';

export function createBootstrapRoutes(db: Database.Database) {
  const router = Router();
  router.get('/bootstrap', requireAuth, (request: AuthenticatedRequest, response) => {
    response.json(buildSessionPayload(db, request.auth!.user));
  });
  return router;
}
