import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { audit } from '../audit/audit-log';
import type { BoardRole } from '../types';

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
