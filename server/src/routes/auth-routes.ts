import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { audit } from '../audit/audit-log';
import { clearSessionCookie, createUserSession, destroyUserSession } from '../auth/session';
import { buildSessionPayload, consumePasswordReset, deleteRecoveryKey, getRecoveryKeyByUserId, getUserByUsername, listUsers, updateUserPassword, upsertRecoveryKey } from '../db/repositories';
import { hashPassword, validatePassword, verifyPassword } from '../auth/passwords';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { randomUUID, randomBytes } from 'node:crypto';

const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
const passwordChangeSchema = z.object({ currentPassword: z.string().min(1), nextPassword: z.string().min(10), confirmPassword: z.string().min(1) });
const bootstrapSchema = z.object({ username: z.string().min(1), password: z.string().min(10), confirmPassword: z.string().min(1) });
const recoveryConsumeSchema = z.object({ username: z.string().min(1), recoveryKey: z.string().min(1), newPassword: z.string().min(10), confirmPassword: z.string().min(1) });

export function createAuthRoutes(db: Database.Database) {
  const router = Router();

  router.get('/needs-bootstrap', (_request, response) => {
    const users = listUsers(db);
    response.json({ needsBootstrap: users.length === 0 });
  });

  router.post('/bootstrap', async (request, response) => {
    const users = listUsers(db);
    if (users.length > 0) {
      response.status(409).json({ message: 'Platform already bootstrapped.' });
      return;
    }
    const parsed = bootstrapSchema.safeParse(request.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const field = first?.path[0];
      const detail = field === 'password' && first?.code === 'too_small'
        ? 'Password must be at least 10 characters long.'
        : first?.message ?? 'Invalid bootstrap payload.';
      response.status(400).json({ message: detail });
      return;
    }
    if (parsed.data.password !== parsed.data.confirmPassword) {
      response.status(400).json({ message: 'Passwords do not match.' });
      return;
    }
    try {
      validatePassword(parsed.data.password);
    } catch (error) {
      response.status(400).json({ message: error instanceof Error ? error.message : 'Invalid password.' });
      return;
    }
    const passwordHash = await hashPassword(parsed.data.password);
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, name, initials, color, username, platform_role, password_hash, active, must_change_password, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, 'Admin', 'AD', '#6366f1', parsed.data.username, 'system_admin', passwordHash, 1, 0, timestamp, timestamp);
    createUserSession(db, id, response);
    audit(db, { actorUserId: id, scopeType: 'auth', action: 'auth.bootstrap', outcome: 'success' });
    const user = getUserByUsername(db, parsed.data.username);
    if (!user) {
      response.status(500).json({ message: 'Bootstrap failed.' });
      return;
    }
    response.status(201).json(buildSessionPayload(db, user));
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

    createUserSession(db, user.id, response);
    audit(db, { actorUserId: user.id, scopeType: 'auth', action: 'auth.login', outcome: 'success' });
    const refreshedUser = getUserByUsername(db, parsed.data.username);
    if (!refreshedUser) {
      response.status(500).json({ message: 'Unable to start session.' });
      return;
    }
    if (refreshedUser.mustChangePassword) {
      response.json({
        status: 'password-change-required',
        user: {
          id: refreshedUser.id,
          name: refreshedUser.name,
          initials: refreshedUser.initials,
          color: refreshedUser.color,
          username: refreshedUser.username,
          platformRole: refreshedUser.platformRole,
          mustChangePassword: true,
        },
      });
      return;
    }
    response.json(buildSessionPayload(db, refreshedUser));
  });

  router.post('/logout', (request: AuthenticatedRequest, response) => {
    const sessionId = request.cookies?.strata_session ?? request.cookies?.[process.env.STRATA_SESSION_COOKIE ?? 'strata_session'];
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
        user: {
          id: request.auth.user.id,
          name: request.auth.user.name,
          initials: request.auth.user.initials,
          color: request.auth.user.color,
          username: request.auth.user.username,
          platformRole: request.auth.user.platformRole,
          mustChangePassword: true,
        },
      });
      return;
    }

    response.json(buildSessionPayload(db, request.auth.user));
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
