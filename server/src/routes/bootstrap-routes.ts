import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { buildSessionPayload, createAuditEvent } from '../db/repositories';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { isSystemAdmin } from '../rbac/permissions';

const workspaceSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  visibility: z.enum(['private', 'workspace', 'public']).default('private'),
});

export function createBootstrapRoutes(db: Database.Database) {
  const router = Router();
  router.get('/bootstrap', requireAuth, (request: AuthenticatedRequest, response) => {
    response.json(buildSessionPayload(db, request.auth!.user));
  });

  router.post('/', requireAuth, (request: AuthenticatedRequest, response) => {
    if (!request.auth || !isSystemAdmin(request.auth)) {
      response.status(403).json({ message: 'Only system admins can create workspaces.' });
      return;
    }
    const parsed = workspaceSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Invalid workspace payload.' });
      return;
    }
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    db.prepare('INSERT INTO workspaces (id, name, description, visibility, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id, parsed.data.name, parsed.data.description, parsed.data.visibility, timestamp,
    );
    db.prepare('INSERT INTO workspace_memberships (id, user_id, workspace_id, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
      randomUUID(), request.auth.user.id, id, 'workspace_admin', timestamp,
    );
    createAuditEvent(db, { actorUserId: request.auth.user.id, scopeType: 'workspace', scopeId: id, action: 'workspace.create', outcome: 'success' });
    response.status(201).json({ id, name: parsed.data.name, description: parsed.data.description, visibility: parsed.data.visibility });
  });

  return router;
}
