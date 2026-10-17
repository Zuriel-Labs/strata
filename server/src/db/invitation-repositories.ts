import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { audit } from '../audit/audit-log';
import type { BoardRole } from '../types';
import { invitationIssuerAuthoritySql } from '../rbac/policies';

export function listPendingBoardInvitations(db: Database.Database, boardId: string, page: number, pageSize: number) {
  const where = `board_id = @boardId AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > @now AND ${invitationIssuerAuthoritySql}`;
  const parameters = { boardId, now: new Date().toISOString() };
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM board_invitations WHERE ${where}`).get(parameters) as { count: number }).count;
  const items = db.prepare(`SELECT id, board_id AS boardId, target_user_id AS targetUserId, role,
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
