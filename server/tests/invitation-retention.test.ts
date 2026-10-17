// @vitest-environment node

import { afterEach, beforeEach, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from '../src/db/database';
import { purgeTerminalBoardInvitations } from '../src/db/invitation-repositories';
import { audit } from '../src/audit/audit-log';

let db: DatabaseHandle;
beforeEach(async () => { process.env.SEED_DATA = 'true'; db = await createDatabase(':memory:'); });
afterEach(() => db.close());

it('purges terminal metadata after 30 days while retaining audit history and live invitations', () => {
  const insert = db.prepare(`INSERT INTO board_invitations (id, board_id, target_user_id, role, token_hash, issuer_user_id, created_at, expires_at, accepted_at, revoked_at)
    VALUES (?, 'b1', 'u2', 'member', ?, 'u4', '2026-09-01T00:00:00.000Z', ?, ?, ?)`);
  const old = '2026-09-01T00:00:00.000Z';
  const cutoff = '2026-09-17T12:00:00.000Z';
  const recent = '2026-10-01T00:00:00.000Z';
  for (const [id, expiresAt, acceptedAt, revokedAt] of [
    ['expired', cutoff, null, null], ['accepted', recent, old, null], ['revoked', recent, old, old],
    ['recent', recent, recent, null], ['pending', '2026-10-18T00:00:00.000Z', null, null],
  ]) {
    insert.run(id, `synthetic-${id}`, expiresAt, acceptedAt, revokedAt);
    audit(db, { actorUserId: 'u4', targetUserId: 'u2', scopeType: 'board', scopeId: 'b1', action: 'board.invitation_create', outcome: 'success', metadata: { invitationId: id } });
  }
  const history = db.prepare('SELECT * FROM audit_events ORDER BY id').all();
  expect(purgeTerminalBoardInvitations(db, new Date('2026-10-17T12:00:00.000Z'))).toBe(3);
  expect(db.prepare('SELECT id FROM board_invitations ORDER BY id').all()).toEqual([{ id: 'pending' }, { id: 'recent' }]);
  expect(db.prepare('SELECT * FROM audit_events ORDER BY id').all()).toEqual(history);
  expect(purgeTerminalBoardInvitations(db, new Date('2026-10-17T12:00:00.000Z'))).toBe(0);
});
