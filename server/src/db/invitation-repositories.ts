import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { audit } from '../audit/audit-log';
import type { BoardRole } from '../types';
import { invitationIssuerAuthoritySql } from '../rbac/policies';
import { createSession, deleteSessionsForUser } from './repositories';

export function acceptBoardInvitation(db: Database.Database, userId: string, token: string) {
  return db.transaction(() => {
    const unavailable = () => {
      audit(db, { actorUserId: userId, scopeType: 'auth', action: 'board.invitation_accept', outcome: 'failure', metadata: { reason: 'unavailable' } });
      return { status: 'unavailable' as const };
    };
    const invitation = db.prepare(`SELECT id, board_id AS boardId, role, expires_at AS expiresAt,
      accepted_at AS acceptedAt, revoked_at AS revokedAt FROM board_invitations WHERE token_hash = ? AND target_user_id = ?`)
      .get(hashBoardInvitationToken(token), userId) as { id: string; boardId: string; role: BoardRole; expiresAt: string; acceptedAt: string | null; revokedAt: string | null } | undefined;
    if (!invitation || invitation.revokedAt || Date.parse(invitation.expiresAt) <= Date.now()) return unavailable();
    if (!db.prepare(`SELECT 1 FROM board_invitations WHERE id = ? AND ${invitationIssuerAuthoritySql}`).get(invitation.id)) {
      db.prepare("UPDATE board_invitations SET revoked_at = ?, revocation_reason = 'issuer_authority_lost' WHERE id = ?").run(new Date().toISOString(), invitation.id);
      return unavailable();
    }
    const membership = db.prepare('SELECT role FROM board_memberships WHERE user_id = ? AND board_id = ?').get(userId, invitation.boardId) as { role: BoardRole } | undefined;
    if (invitation.acceptedAt) {
      if (!membership) {
        db.prepare("UPDATE board_invitations SET revoked_at = ?, revocation_reason = 'membership_removed' WHERE id = ?").run(new Date().toISOString(), invitation.id);
        return unavailable();
      }
      return { status: 'accepted' as const, boardId: invitation.boardId, membershipRole: membership.role, alreadyAccepted: true, sessionId: null };
    }
    if (membership) return { status: 'member' as const };
    const now = new Date().toISOString();
    db.prepare('INSERT INTO board_memberships (id, user_id, board_id, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), userId, invitation.boardId, invitation.role, now);
    db.prepare('UPDATE board_invitations SET accepted_at = ? WHERE id = ?').run(now, invitation.id);
    deleteSessionsForUser(db, userId);
    const session = createSession(db, userId);
    audit(db, { actorUserId: userId, targetUserId: userId, scopeType: 'board', scopeId: invitation.boardId, action: 'board.invitation_accept', outcome: 'success', metadata: { invitationId: invitation.id, role: invitation.role } });
    return { status: 'accepted' as const, boardId: invitation.boardId, membershipRole: invitation.role, alreadyAccepted: false, sessionId: session.id };
  })();
}

export function listPendingBoardInvitations(db: Database.Database, boardId: string, page: number, pageSize: number) {
  const where = `board_id = @boardId AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > @now AND ${invitationIssuerAuthoritySql}`;
  const parameters = { boardId, now: new Date().toISOString() };
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM board_invitations WHERE ${where}`).get(parameters) as { count: number }).count;
  const items = db.prepare(`SELECT id, board_id AS boardId, target_user_id AS targetUserId, role,
    (SELECT name FROM users WHERE id = target_user_id) AS targetName,
    (SELECT username FROM users WHERE id = target_user_id) AS targetUsername,
    issuer_user_id AS issuerUserId, created_at AS createdAt, expires_at AS expiresAt, 'pending' AS status
    FROM board_invitations WHERE ${where} ORDER BY created_at DESC, id ASC LIMIT @limit OFFSET @offset`)
    .all({ ...parameters, limit: pageSize, offset: (page - 1) * pageSize });
  return { items, page: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export function revokeBoardInvitation(db: Database.Database, actorId: string, boardId: string, invitationId: string) {
  // The database trigger writes the audit in this same statement's transaction.
  db.prepare(`UPDATE board_invitations SET revoked_at = ?, revoked_by_user_id = ?, revocation_reason = 'manual'
    WHERE id = ? AND board_id = ? AND revoked_at IS NULL`).run(new Date().toISOString(), actorId, invitationId, boardId);
}

export function hashBoardInvitationToken(token: string) {
  return createHash('sha256').update(`strata:board-invitation:${token}`).digest('hex');
}

export function createBoardInvitation(db: Database.Database, issuerId: string, boardId: string, targetUserId: string, role: BoardRole, expiresAt: string) {
  return db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM users WHERE id = ? AND active = 1').get(targetUserId)) return { status: 'invalid' as const };
    if (db.prepare('SELECT 1 FROM board_memberships WHERE user_id = ? AND board_id = ?').get(targetUserId, boardId)) return { status: 'member' as const };
    const id = randomUUID();
    const token = `bi_${randomBytes(32).toString('hex')}`;
    db.prepare(`INSERT INTO board_invitations (id, board_id, target_user_id, role, token_hash, issuer_user_id, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, boardId, targetUserId, role, hashBoardInvitationToken(token), issuerId, new Date().toISOString(), expiresAt);
    audit(db, { actorUserId: issuerId, targetUserId, scopeType: 'board', scopeId: boardId, action: 'board.invitation_create', outcome: 'success', metadata: { invitationId: id, role, expiresAt } });
    return { status: 'created' as const, invitation: { id, boardId, targetUserId, role, expiresAt, status: 'pending' as const }, token };
  })();
}

export function purgeTerminalBoardInvitations(db: Database.Database, now = new Date()) {
  const cutoff = new Date(now.getTime() - 30 * 86400000).toISOString();
  return db.prepare(`DELETE FROM board_invitations WHERE id IN (
    SELECT id FROM board_invitations WHERE COALESCE(revoked_at, accepted_at, expires_at) <= ?
    ORDER BY COALESCE(revoked_at, accepted_at, expires_at), id LIMIT 1000)`).run(cutoff).changes;
}
