import { Router } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canManageBoardInvitations } from '../rbac/policies';
import { createBoardInvitation } from '../db/invitation-repositories';
import { audit } from '../audit/audit-log';

const invitationBody = z.object({ targetUserId: z.string().min(1).max(100), role: z.enum(['member', 'observer']), expiresAt: z.iso.datetime() }).strict();

export function createAdminInvitationRoutes(db: Database.Database) {
  const router = Router();
  router.use(requireAuth);
  router.post('/boards/:boardId/invitations', (request: AuthenticatedRequest, response) => {
    const actor = request.auth;
    if (!actor) return;
    const boardId = String(request.params.boardId);
    if (!canManageBoardInvitations(db, actor, boardId)) {
      audit(db, { actorUserId: actor.user.id, scopeType: 'board', scopeId: boardId, action: 'board.invitation_create', outcome: 'failure', metadata: { reason: 'forbidden' } });
      response.status(403).json({ message: 'Forbidden.' });
      return;
    }
    const parsed = invitationBody.safeParse(request.body);
    const now = Date.now();
    if (!parsed.success || Date.parse(parsed.data.expiresAt) <= now || Date.parse(parsed.data.expiresAt) > now + 7 * 86400000) {
      response.status(400).json({ code: 'INVITATION_INVALID', message: 'Invalid invitation request.' });
      return;
    }
    const result = createBoardInvitation(db, actor.user.id, boardId, parsed.data.targetUserId, parsed.data.role, new Date(parsed.data.expiresAt).toISOString());
    if (result.status === 'invalid') response.status(400).json({ code: 'INVITATION_INVALID', message: 'Invalid invitation request.' });
    else if (result.status === 'member') response.status(409).json({ code: 'MEMBERSHIP_ALREADY_EXISTS', message: 'Board membership already exists.' });
    else response.status(201).set('Cache-Control', 'no-store').json({ invitation: result.invitation, token: result.token });
  });
  return router;
}
