import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { requireContentAuth as requireAuth, safeContentErrors, type AuthenticatedRequest } from '../http/auth-middleware';
import { canReadBoardContent as canAccessBoard, canReadWorkspaceContent as canAccessWorkspace, canManageUserBoard as canManageBoard, canManageUserWorkspace as canManageWorkspace } from '../rbac/policies';
import { isWorkspaceActive } from '../rbac/lifecycle';
import { createAuditEvent, getBoardById, getWorkspaceById } from '../db/repositories';

const revisionSchema = z.object({ expectedRevision: z.number().int().min(0) }).strict();
const templateSchema = revisionSchema.extend({ isTemplate: z.boolean() }).strict();

export function createLifecycleRoutes(db: Database.Database) {
  const router = Router();
  for (const kind of ['workspaces', 'boards'] as const) {
    for (const action of ['close', 'reopen'] as const) {
      router.post(`/${kind}/:id/${action}`, requireAuth, (request: AuthenticatedRequest, response) => {
        const id = String(request.params.id);
        const parsed = revisionSchema.safeParse(request.body);
        if (!parsed.success) { response.status(400).json({ code: 'INPUT_INVALID', message: 'A current revision is required.' }); return; }
        const board = kind === 'boards' ? getBoardById(db, id) : null;
        const resource = board ?? (kind === 'workspaces' ? getWorkspaceById(db, id) : null);
        const auth = request.auth!;
        if (!resource || !(kind === 'boards' ? canAccessBoard(db, auth, id) : canAccessWorkspace(auth, id))) {
          response.status(404).json({ code: 'RESOURCE_UNAVAILABLE', message: 'Resource unavailable.' }); return;
        }
        if (!(kind === 'boards' ? canManageBoard(db, auth, id) : canManageWorkspace(auth, id))) {
          response.status(403).json({ code: 'ACTION_FORBIDDEN', message: 'Administrator permission required.' }); return;
        }
        if (board && !isWorkspaceActive(db, board.workspaceId)) {
          response.status(409).json({ code: 'PARENT_INACTIVE', message: 'Reopen the workspace first.' }); return;
        }
        const lifecycleState = action === 'close' ? 'closed' : 'active';
        if (resource.lifecycleState === lifecycleState) {
          response.json({ id, lifecycleState, revision: resource.revision }); return;
        }
        if (resource.revision !== parsed.data.expectedRevision) {
          response.status(409).json({ code: 'REVISION_CONFLICT', message: 'This resource changed. Refresh before continuing.' }); return;
        }
        db.transaction(() => {
          db.prepare(`UPDATE ${kind} SET lifecycle_state = ?, closed_at = ?, closed_by_user_id = ? WHERE id = ?`)
            .run(lifecycleState, action === 'close' ? new Date().toISOString() : null, action === 'close' ? auth.user.id : null, id);
          createAuditEvent(db, { actorUserId: auth.user.id, scopeType: kind === 'boards' ? 'board' : 'workspace', scopeId: id, action: `${kind === 'boards' ? 'board' : 'workspace'}.${action}`, outcome: 'success' });
        })();
        const revision = Number(db.prepare(`SELECT revision FROM ${kind} WHERE id = ?`).pluck().get(id));
        response.json({ id, lifecycleState, revision });
      });
    }
  }
  router.put('/boards/:id/template', requireAuth, (request: AuthenticatedRequest, response) => {
    const id = String(request.params.id);
    const parsed = templateSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ code: 'INPUT_INVALID', message: 'Invalid template settings.' }); return; }
    const board = getBoardById(db, id);
    if (!board || !canAccessBoard(db, request.auth!, id)) { response.status(404).json({ code: 'RESOURCE_UNAVAILABLE', message: 'Resource unavailable.' }); return; }
    if (!canManageBoard(db, request.auth!, id)) { response.status(403).json({ code: 'ACTION_FORBIDDEN', message: 'Administrator permission required.' }); return; }
    if (board.isTemplate === parsed.data.isTemplate) { response.json(board); return; }
    if (board.revision !== parsed.data.expectedRevision) { response.status(409).json({ code: 'REVISION_CONFLICT', message: 'This board changed. Refresh before continuing.' }); return; }
    db.transaction(() => {
      db.prepare("UPDATE boards SET is_template = ?, visibility = CASE WHEN ? = 1 THEN 'private' ELSE visibility END WHERE id = ?").run(Number(parsed.data.isTemplate), Number(parsed.data.isTemplate), id);
      createAuditEvent(db, { actorUserId: request.auth!.user.id, scopeType: 'board', scopeId: id, action: 'board.template_update', outcome: 'success' });
    })();
    response.json(getBoardById(db, id));
  });
  router.use(safeContentErrors);
  return router;
}
