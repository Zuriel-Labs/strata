import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { audit } from '../audit/audit-log';
import { clearSessionCookie, createUserSession, destroyUserSession } from '../auth/session';
import { buildSessionPayload, consumePasswordReset, getUserByEmail, updateUserPassword } from '../db/repositories';
import { hashPassword, validatePassword, verifyPassword } from '../auth/passwords';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const passwordChangeSchema = z.object({ currentPassword: z.string().min(1), nextPassword: z.string().min(10) });

export function createAuthRoutes(db: Database.Database) {
  const router = Router();

  router.post('/login', async (request, response) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Invalid login payload.' });
      return;
    }

    const user = getUserByEmail(db, parsed.data.email);
    if (!user || !user.active || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      audit(db, { scopeType: 'auth', action: 'auth.login', outcome: 'failure', metadata: { email: parsed.data.email } });
      response.status(401).json({ message: 'Invalid credentials.' });
      return;
    }

    createUserSession(db, user.id, response);
    audit(db, { actorUserId: user.id, scopeType: 'auth', action: 'auth.login', outcome: 'success' });
    const refreshedUser = getUserByEmail(db, parsed.data.email);
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
          email: refreshedUser.email,
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
          email: request.auth.user.email,
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

  return router;
}
