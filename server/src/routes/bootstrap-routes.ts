import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { buildSessionPayload, createAuditEvent, getWorkspaceById } from '../db/repositories';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canManageWorkspace, isSystemAdmin } from '../rbac/permissions';

const workspaceSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  visibility: z.enum(['private', 'workspace', 'public']).default('private'),
});

const updateWorkspaceSchema = z.object({
  name: z.string().transform(value => value.trim()).refine(value => value.length > 0),
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

  router.patch('/:workspaceId', requireAuth, (request: AuthenticatedRequest, response) => {
    const workspaceId = String(request.params.workspaceId);
    const workspace = getWorkspaceById(db, workspaceId);
    if (!workspace) {
      response.status(404).json({ message: 'Workspace not found.' });
      return;
    }
    if (!canManageWorkspace(request.auth!, workspaceId)) {
      response.status(403).json({ message: 'Access denied.' });
      return;
    }

    const parsed = updateWorkspaceSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Invalid workspace payload.' });
      return;
    }

    db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(parsed.data.name, workspaceId);
    createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'workspace', scopeId: workspaceId, action: 'workspace.update', outcome: 'success' });
    response.json({ ...workspace, name: parsed.data.name });
  });

  router.delete('/:workspaceId', requireAuth, (request: AuthenticatedRequest, response) => {
    const workspaceId = String(request.params.workspaceId);
    const workspace = db.prepare('SELECT id, name FROM workspaces WHERE id = ?').get(workspaceId) as { id: string; name: string } | undefined;
    if (!workspace) {
      response.status(404).json({ message: 'Workspace not found.' });
      return;
    }
    if (!canManageWorkspace(request.auth!, workspaceId)) {
      response.status(403).json({ message: 'Access denied.' });
      return;
    }

    db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId);
    createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'workspace', scopeId: workspaceId, action: 'workspace.delete', outcome: 'success' });
    response.json({ success: true });
  });

  return router;
}
