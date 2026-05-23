import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { audit } from '../audit/audit-log';
import { clearSessionCookie, createUserSession, destroyUserSession, SESSION_COOKIE } from '../auth/session';
import { buildSessionPayload, consumePasswordReset, deleteRecoveryKey, getRecoveryKeyByUserId, getUserByUsername, listUsers, updateUserPassword, updateUserPreferences, updateUserProfile, upsertRecoveryKey, userHasAccessToBoard, userHasAccessToWorkspace } from '../db/repositories';
import { hashPassword, hashPasswordSync, validatePassword, verifyPassword } from '../auth/passwords';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { randomUUID, randomBytes } from 'node:crypto';
import type { UserRecord } from '../types';

const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
const passwordChangeSchema = z.object({ currentPassword: z.string().min(1), nextPassword: z.string().min(10), confirmPassword: z.string().min(1) });
const bootstrapSchema = z.object({ username: z.string().min(1), password: z.string().min(10), confirmPassword: z.string().min(1) });
const recoveryConsumeSchema = z.object({ username: z.string().min(1), recoveryKey: z.string().min(1), newPassword: z.string().min(10), confirmPassword: z.string().min(1) });
const profileUpdateSchema = z.object({
  name: z.string().trim().min(1),
  initials: z.string().trim().min(1).max(4),
  color: z.string().trim().min(4),
});
const preferencesUpdateSchema = z.object({
  themePreference: z.enum(['dark', 'light']).optional(),
  defaultWorkspaceId: z.string().uuid().nullable().optional(),
  defaultBoardId: z.string().uuid().nullable().optional(),
}).refine(
  data => {
    if (data.defaultBoardId != null && data.defaultWorkspaceId == null) {
      return false;
    }
    return true;
  },
  { message: 'Cannot set default board without a default workspace.', path: ['defaultBoardId'] }
);

function buildSessionUser(user: UserRecord) {
  return {
    id: user.id,
    name: user.name,
    initials: user.initials,
    color: user.color,
    themePreference: user.themePreference,
    username: user.username,
    platformRole: user.platformRole,
    mustChangePassword: user.mustChangePassword,
    defaultWorkspaceId: user.defaultWorkspaceId,
    defaultBoardId: user.defaultBoardId,
  };
}

function buildValidationMessage(error: z.ZodError, fallback: string) {
  const first = error.issues[0];
  return first?.message ?? fallback;
}

export function createAuthRoutes(db: Database.Database) {
  const router = Router();

  router.get('/needs-bootstrap', (_request, response) => {
    const users = listUsers(db);
    response.json({ needsBootstrap: users.length === 0 });
  });

  router.post('/bootstrap', async (request, response) => {
    const bootstrapResult = db.transaction(() => {
      const users = listUsers(db);
      if (users.length > 0) {
        return null;
      }
      const parsed = bootstrapSchema.safeParse(request.body);
      if (!parsed.success) {
        return { status: 400, body: parsed.error };
      }
      if (parsed.data.password !== parsed.data.confirmPassword) {
        return { status: 400, body: { message: 'Passwords do not match.' } };
      }
      try {
        validatePassword(parsed.data.password);
      } catch (error) {
        return { status: 400, body: { message: error instanceof Error ? error.message : 'Invalid password.' } };
      }
      const passwordHash = hashPasswordSync(parsed.data.password);
      const id = randomUUID();
      const timestamp = new Date().toISOString();
      db.prepare(`
        INSERT INTO users (id, name, initials, color, username, platform_role, password_hash, active, must_change_password, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, 'Admin', 'AD', '#6366f1', parsed.data.username, 'system_admin', passwordHash, 1, 0, timestamp, timestamp);
      createUserSession(db, id, request, response);
      audit(db, { actorUserId: id, scopeType: 'auth', action: 'auth.bootstrap', outcome: 'success' });
      const user = getUserByUsername(db, parsed.data.username);
      if (!user) {
        return { status: 500, body: { message: 'Bootstrap failed.' } };
      }
      return { status: 201, body: buildSessionPayload(db, user) };
    })();

    if (bootstrapResult === null) {
      response.status(409).json({ message: 'Platform already bootstrapped.' });
      return;
    }
    if (bootstrapResult.status && bootstrapResult.status !== 201) {
      // early-exit markers for validation errors inside transaction
      if (bootstrapResult.status === 400 && bootstrapResult.body instanceof z.ZodError) {
        const first = bootstrapResult.body.issues[0];
        const field = first?.path[0];
        const detail = field === 'password' && first?.code === 'too_small'
          ? 'Password must be at least 10 characters long.'
          : first?.message ?? 'Invalid bootstrap payload.';
        response.status(400).json({ message: detail });
        return;
      }
      response.status(bootstrapResult.status).json(bootstrapResult.body);
      return;
    }
    response.status(201).json(bootstrapResult!.body);
  });

  router.post('/login', async (request, response) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Invalid login payload.' });
      return;
    }

    const user = getUserByUsername(db, parsed.data.username);
    if (!user || !user.active || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      audit(db, { scopeType: 'auth', action: 'auth.login', outcome: 'failure', metadata: { username: parsed.data.username } });
      response.status(401).json({ message: 'Invalid credentials.' });
      return;
    }

    createUserSession(db, user.id, request, response);
    audit(db, { actorUserId: user.id, scopeType: 'auth', action: 'auth.login', outcome: 'success' });
    const refreshedUser = getUserByUsername(db, parsed.data.username);
    if (!refreshedUser) {
      response.status(500).json({ message: 'Unable to start session.' });
      return;
    }
    if (refreshedUser.mustChangePassword) {
      response.json({
        status: 'password-change-required',
        user: buildSessionUser({ ...refreshedUser, mustChangePassword: true }),
      });
      return;
    }
    response.json(buildSessionPayload(db, refreshedUser));
  });

  router.post('/logout', (request: AuthenticatedRequest, response) => {
    const sessionId = request.cookies?.[SESSION_COOKIE];
    if (request.auth) {
      audit(db, { actorUserId: request.auth.user.id, scopeType: 'auth', action: 'auth.logout', outcome: 'success' });
    }
    destroyUserSession(db, sessionId, response);
    response.status(204).send();
  });

  router.get('/session', (request: AuthenticatedRequest, response) => {
    if (!request.auth) {
      clearSessionCookie(response);
      response.status(401).json({ message: 'No active session.' });
      return;
    }

    if (request.auth.user.mustChangePassword) {
      response.json({
        status: 'password-change-required',
        user: buildSessionUser({ ...request.auth.user, mustChangePassword: true }),
      });
      return;
    }

    response.json(buildSessionPayload(db, request.auth.user));
  });

  router.patch('/profile', requireAuth, (request: AuthenticatedRequest, response) => {
    const parsed = profileUpdateSchema.safeParse(request.body);
    if (!parsed.success || !request.auth) {
      response.status(400).json({ message: parsed.success ? 'Invalid profile update payload.' : buildValidationMessage(parsed.error, 'Invalid profile update payload.') });
      return;
    }

    const updated = updateUserProfile(db, request.auth.user.id, {
      name: parsed.data.name.trim(),
      initials: parsed.data.initials.trim().slice(0, 4).toUpperCase(),
      color: parsed.data.color.trim(),
    });

    if (!updated) {
      response.status(404).json({ message: 'User not found.' });
      return;
    }

    audit(db, { actorUserId: updated.id, scopeType: 'auth', action: 'auth.profile_update', outcome: 'success' });
    response.json({ user: buildSessionUser(updated) });
  });

  router.patch('/preferences', requireAuth, (request: AuthenticatedRequest, response) => {
    const parsed = preferencesUpdateSchema.safeParse(request.body);
    if (!parsed.success || !request.auth) {
      response.status(400).json({ message: parsed.success ? 'Invalid preferences payload.' : buildValidationMessage(parsed.error, 'Invalid preferences payload.') });
      return;
    }

    const user = request.auth.user;

    if (parsed.data.defaultWorkspaceId && !userHasAccessToWorkspace(db, user.id, parsed.data.defaultWorkspaceId, user)) {
      response.status(400).json({ message: 'Invalid default workspace.' });
      return;
    }

    if (parsed.data.defaultBoardId) {
      if (!parsed.data.defaultWorkspaceId) {
        response.status(400).json({ message: 'Cannot set default board without a default workspace.' });
        return;
      }
      if (!userHasAccessToBoard(db, user.id, parsed.data.defaultBoardId, parsed.data.defaultWorkspaceId, user)) {
        response.status(400).json({ message: 'Invalid default board.' });
        return;
      }
    }

    const updated = updateUserPreferences(db, user.id, {
      themePreference: parsed.data.themePreference,
      defaultWorkspaceId: parsed.data.defaultWorkspaceId,
      defaultBoardId: parsed.data.defaultBoardId,
    });

    if (!updated) {
      response.status(404).json({ message: 'User not found.' });
      return;
    }

    audit(db, { actorUserId: updated.id, scopeType: 'auth', action: 'auth.preferences_update', outcome: 'success', metadata: { themePreference: updated.themePreference, defaultWorkspaceId: updated.defaultWorkspaceId, defaultBoardId: updated.defaultBoardId } });
    response.json({ user: buildSessionUser(updated) });
  });

  router.post('/password/change', requireAuth, async (request: AuthenticatedRequest, response) => {
    const parsed = passwordChangeSchema.safeParse(request.body);
    if (!parsed.success || !request.auth) {
      response.status(400).json({ message: 'Invalid password change payload.' });
      return;
    }
    if (parsed.data.nextPassword !== parsed.data.confirmPassword) {
      response.status(400).json({ message: 'Passwords do not match.' });
      return;
    }
    const valid = await verifyPassword(parsed.data.currentPassword, request.auth.user.passwordHash);
    if (!valid) {
      audit(db, { actorUserId: request.auth.user.id, scopeType: 'auth', action: 'auth.password_change', outcome: 'failure' });
      response.status(401).json({ message: 'Current password is incorrect.' });
      return;
    }
    try {
      validatePassword(parsed.data.nextPassword);
      const passwordHash = await hashPassword(parsed.data.nextPassword);
      updateUserPassword(db, request.auth.user.id, passwordHash, false);
      consumePasswordReset(db, request.auth.user.id);
      audit(db, { actorUserId: request.auth.user.id, scopeType: 'auth', action: 'auth.password_change', outcome: 'success' });
      response.status(204).send();
    } catch (error) {
      response.status(400).json({ message: error instanceof Error ? error.message : 'Password update failed.' });
    }
  });

  router.post('/recovery-key/generate', requireAuth, async (request: AuthenticatedRequest, response) => {
    if (!request.auth) {
      response.status(401).json({ message: 'Not authenticated.' });
      return;
    }
    const rawKey = randomBytes(32).toString('hex');
    const keyHash = await hashPassword(rawKey);
    upsertRecoveryKey(db, request.auth.user.id, keyHash);
    audit(db, { actorUserId: request.auth.user.id, scopeType: 'auth', action: 'auth.recovery_key_generate', outcome: 'success' });
    response.json({ recoveryKey: rawKey });
  });

  router.post('/recovery-key/consume', async (request, response) => {
    const parsed = recoveryConsumeSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Invalid recovery payload.' });
      return;
    }
    if (parsed.data.newPassword !== parsed.data.confirmPassword) {
      response.status(400).json({ message: 'Passwords do not match.' });
      return;
    }
    const user = getUserByUsername(db, parsed.data.username);
    if (!user) {
      response.status(401).json({ message: 'Invalid recovery request.' });
      return;
    }
    const recovery = getRecoveryKeyByUserId(db, user.id);
    if (!recovery) {
      response.status(401).json({ message: 'No recovery key configured.' });
      return;
    }
    const keyValid = await verifyPassword(parsed.data.recoveryKey, recovery.keyHash);
    if (!keyValid) {
      audit(db, { actorUserId: user.id, scopeType: 'auth', action: 'auth.recovery_consume', outcome: 'failure' });
      response.status(401).json({ message: 'Invalid recovery key.' });
      return;
    }
    try {
      validatePassword(parsed.data.newPassword);
      const passwordHash = await hashPassword(parsed.data.newPassword);
      updateUserPassword(db, user.id, passwordHash, false);
      deleteRecoveryKey(db, user.id);
      // Generate a new recovery key automatically
      const newRawKey = randomBytes(32).toString('hex');
      const newKeyHash = await hashPassword(newRawKey);
      upsertRecoveryKey(db, user.id, newKeyHash);
      audit(db, { actorUserId: user.id, scopeType: 'auth', action: 'auth.recovery_consume', outcome: 'success' });
      response.json({ newRecoveryKey: newRawKey });
    } catch (error) {
      response.status(400).json({ message: error instanceof Error ? error.message : 'Password reset failed.' });
    }
  });

  return router;
}
