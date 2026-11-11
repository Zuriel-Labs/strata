import { Router, type Response } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { revalidateAuthContext, requireAuth, type AuthenticatedRequest } from '../http/auth-middleware';
import { canAcceptBoardInvitations, canManageBoardInvitations } from '../rbac/policies';
import { acceptBoardInvitation, createBoardInvitation, listPendingBoardInvitations, revokeBoardInvitation } from '../db/invitation-repositories';
import { audit } from '../audit/audit-log';
import { setSessionCookie } from '../auth/session';

export const invitationBody = z.object({ targetUserId: z.string().min(1).max(100), role: z.enum(['member', 'observer']), expiresAt: z.iso.datetime() }).strict();
const invitationParams = z.object({ boardId: z.string().min(1).max(100), invitationId: z.string().uuid().optional() }).strict();
export const invitationQuery = z.object({ status: z.literal('pending').default('pending'), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) }).strict();
export const acceptBody = z.object({ token: z.string().regex(/^bi_[a-f0-9]{64}$/) }).strict();

export function createRecipientInvitationRoutes(db: Database.Database) {
  const router = Router();
  router.post('/board-invitations/accept', requireAuth, (request: AuthenticatedRequest, response) => {
    const actor = request.auth ? revalidateAuthContext(db, request.auth) : null;
    if (!actor) { response.status(401).json({ message: 'Authentication required.' }); return; }
    if (!canAcceptBoardInvitations(actor)) { response.status(403).json({ message: 'Password change required.' }); return; }
    const parsed = acceptBody.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ code: 'INVITATION_INVALID', message: 'Invalid invitation request.' }); return; }
    try {
      const result = acceptBoardInvitation(db, actor.user.id, parsed.data.token, !actor.credential);
      if (result.status === 'unavailable') response.status(404).json({ code: 'INVITATION_UNAVAILABLE', message: 'Invitation unavailable.' });
      else if (result.status === 'member') response.status(409).json({ code: 'MEMBERSHIP_ALREADY_EXISTS', message: 'Board membership already exists.' });
      else {
        if (result.sessionId) setSessionCookie(request, response, result.sessionId);
        response.set('Cache-Control', 'no-store').json({ boardId: result.boardId, membershipRole: result.membershipRole, alreadyAccepted: result.alreadyAccepted });
      }
    } catch { response.status(500).json({ message: 'Unable to accept invitation.' }); }
  });
  return router;
}

function authorize(db: Database.Database, request: AuthenticatedRequest, response: Response, action: string) {
  const actor = request.auth;
  if (!actor) { response.status(401).json({ message: 'Authentication required.' }); return null; }
  const params = invitationParams.safeParse(request.params);
  if (!params.success) { response.status(400).json({ code: 'INVITATION_INVALID', message: 'Invalid invitation request.' }); return null; }
  const { boardId } = params.data;
  if (!canManageBoardInvitations(db, actor, boardId)) {
    audit(db, { actorUserId: actor.user.id, scopeType: 'board', scopeId: boardId, action, outcome: 'failure', metadata: { reason: 'forbidden' } });
    response.status(403).json({ message: 'Forbidden.' });
    return null;
  }
  return { actor, ...params.data };
}

export function createAdminInvitationRoutes(db: Database.Database) {
  const router = Router();
  router.use(requireAuth);
  router.get('/boards/:boardId/invitations', (request: AuthenticatedRequest, response) => {
    const scope = authorize(db, request, response, 'board.invitation_list');
    if (!scope) return;
    const query = invitationQuery.safeParse(request.query);
    if (!query.success) { response.status(400).json({ code: 'INVITATION_INVALID', message: 'Invalid invitation request.' }); return; }
    response.set('Cache-Control', 'no-store').json(listPendingBoardInvitations(db, scope.boardId, query.data.page, query.data.pageSize));
  });
  router.delete('/boards/:boardId/invitations/:invitationId', (request: AuthenticatedRequest, response) => {
    const scope = authorize(db, request, response, 'board.invitation_revoke');
    if (!scope?.invitationId) return;
    revokeBoardInvitation(db, scope.actor.user.id, scope.boardId, scope.invitationId);
    response.status(204).send();
  });
  router.post('/boards/:boardId/invitations', (request: AuthenticatedRequest, response) => {
    const scope = authorize(db, request, response, 'board.invitation_create');
    if (!scope) return;
    const { actor, boardId } = scope;
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
