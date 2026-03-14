import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { createManagedUser, listAdminUsers, updateManagedUser } from '../db/admin-repositories';
import { getBoardMembershipsForUser, getWorkspaceMembershipsForUser, getUserById, listAuditEvents, upsertRecoveryKey } from '../db/repositories';
import { hashPassword } from '../auth/passwords';
import { randomBytes } from 'node:crypto';
import { audit } from '../audit/audit-log';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canManageUserPlatform } from '../rbac/policies';
import type { BoardRole, WorkspaceRole } from '../types';

const userSchema = z.object({
  name: z.string().min(1),
  initials: z.string().min(1).max(4),
  color: z.string().min(4),
  username: z.string().min(1),
  platformRole: z.enum(['system_admin', 'user']).default('user'),
  active: z.boolean().default(true),
  workspaceMemberships: z.array(z.object({ workspaceId: z.string(), role: z.enum(['workspace_admin', 'member']) })).default([]),
  boardMemberships: z.array(z.object({ boardId: z.string(), role: z.enum(['board_admin', 'member', 'observer']) })).default([]),
});

const userPatchSchema = userSchema.partial();

export function createAdminRoutes(db: Database.Database) {
  const router = Router();
  router.use(requireAuth);

  router.get('/users', (request: AuthenticatedRequest, response) => {
    if (!request.auth || !canManageUserPlatform(request.auth)) {
      response.status(403).json({ message: 'Forbidden.' });
      return;
    }
    response.json({
      users: listAdminUsers(db).map(user => ({
        ...user,
        workspaceMemberships: getWorkspaceMembershipsForUser(db, user.id),
        boardMemberships: getBoardMembershipsForUser(db, user.id),
      })),
      workspaces: db.prepare('SELECT id, name FROM workspaces ORDER BY name ASC').all(),
      boards: db.prepare('SELECT id, title, workspace_id as workspaceId FROM boards ORDER BY title ASC').all(),
      auditEvents: listAuditEvents(db).slice(0, 25),
    });
  });

  router.post('/users', async (request: AuthenticatedRequest, response) => {
    if (!request.auth || !canManageUserPlatform(request.auth)) {
      response.status(403).json({ message: 'Forbidden.' });
      return;
    }
    const parsed = userSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Invalid user payload.' });
      return;
    }
    const placeholderPassword = randomBytes(32).toString('hex');
    const passwordHash = await hashPassword(placeholderPassword);
    const created = createManagedUser(db, request.auth.user, {
      ...parsed.data,
      workspaceMemberships: parsed.data.workspaceMemberships as Array<{ workspaceId: string; role: WorkspaceRole }>,
      boardMemberships: parsed.data.boardMemberships as Array<{ boardId: string; role: BoardRole }>,
      passwordHash,
      mustChangePassword: false,
    });
    if (!created) {
      response.status(500).json({ message: 'Unable to create user.' });
      return;
    }
    const inviteToken = randomBytes(32).toString('hex');
    const inviteHash = await hashPassword(inviteToken);
    upsertRecoveryKey(db, created.id, inviteHash);
    audit(db, { actorUserId: request.auth.user.id, scopeType: 'platform', action: 'admin.user_create', outcome: 'success', metadata: { username: parsed.data.username } });
    response.status(201).json({ user: created, inviteToken });
  });

  router.patch('/users/:userId', (request: AuthenticatedRequest, response) => {
    if (!request.auth || !canManageUserPlatform(request.auth)) {
      response.status(403).json({ message: 'Forbidden.' });
      return;
    }
    const parsed = userPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Invalid user update payload.' });
      return;
    }
    try {
      const updated = updateManagedUser(db, request.auth.user, String(request.params.userId), {
        ...parsed.data,
        workspaceMemberships: parsed.data.workspaceMemberships as Array<{ workspaceId: string; role: WorkspaceRole }> | undefined,
        boardMemberships: parsed.data.boardMemberships as Array<{ boardId: string; role: BoardRole }> | undefined,
      });
      if (!updated) {
        response.status(404).json({ message: 'User not found.' });
        return;
      }
      response.json({ user: updated });
    } catch (error) {
      response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to update user.' });
    }
  });

  router.post('/users/:userId/generate-recovery-key', async (request: AuthenticatedRequest, response) => {
    if (!request.auth || !canManageUserPlatform(request.auth)) {
      response.status(403).json({ message: 'Forbidden.' });
      return;
    }
    const user = getUserById(db, String(request.params.userId));
    if (!user) {
      response.status(404).json({ message: 'User not found.' });
      return;
    }
    const rawKey = randomBytes(32).toString('hex');
    const keyHash = await hashPassword(rawKey);
    upsertRecoveryKey(db, user.id, keyHash);
    audit(db, { actorUserId: request.auth.user.id, targetUserId: user.id, scopeType: 'auth', action: 'auth.admin_recovery_key_generate', outcome: 'success' });
    response.json({ recoveryKey: rawKey });
  });

  return router;
}
