import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { requireContentAuth as requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { ContentOperationError, operationSchema, commitSchema } from '../content/operation-contract';
import { previewOperation } from '../content/operation-plan';
import { commitOperation } from '../content/commit-operation';

export function createContentOperationRoutes(db: Database.Database) {
  const router = Router();
  router.use(requireAuth);
  router.post('/preview', (request: AuthenticatedRequest, response) => {
    const parsed = operationSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ code: 'INPUT_INVALID', message: 'Invalid operation settings.' }); return; }
    try { response.json(previewOperation(db, request.auth!, parsed.data)); }
    catch (error) {
      if (error instanceof ContentOperationError) { response.status(error.status).json({ code: error.code, message: error.message }); return; }
      response.status(500).json({ code: 'OPERATION_FAILED', message: 'Unable to preview content.' });
    }
  });
  router.post('/', (request: AuthenticatedRequest, response) => {
    const parsed = commitSchema.safeParse(request.body);
    const key = z.uuid().safeParse(request.get('Idempotency-Key'));
    if (!parsed.success || !key.success) { response.status(400).json({ code: 'INPUT_INVALID', message: 'Valid operation settings and operation key are required.' }); return; }
    try {
      const committed = commitOperation(db, request.auth!, key.data, parsed.data);
      response.status(committed.status).json(committed.result);
    } catch (error) {
      if (error instanceof ContentOperationError) { response.status(error.status).json({ code: error.code, message: error.message }); return; }
      response.status(500).json({ code: 'OPERATION_FAILED', message: 'Unable to complete content operation. Nothing was changed.' });
    }
  });
  return router;
}
