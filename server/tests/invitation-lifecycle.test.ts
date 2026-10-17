// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from '../src/db/database';
import { createSchema } from '../src/db/schema';
import { replaceAssignments } from '../src/db/admin-repositories';

describe('board invitation lifecycle', () => {
  let db: DatabaseHandle;
  beforeEach(async () => { process.env.SEED_DATA = 'true'; db = await createDatabase(':memory:'); });
  afterEach(() => db.close());

  it('preserves unchanged authority and membership identities during assignment reconciliation', () => {
    const tables = ['workspace_admin_grants', 'board_admin_grants', 'board_memberships'];
    const before = tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    replaceAssignments(db, 'u1', 'u2', { workspaceAdminWorkspaceIds: ['w1'], boardAdminBoardIds: [], boardMemberships: [] });
    replaceAssignments(db, 'u1', 'u4', { workspaceAdminWorkspaceIds: [], boardAdminBoardIds: ['b1'], boardMemberships: [{ boardId: 'b2', role: 'observer' }] });
    expect(tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())).toEqual(before);
  });
  it('adds invitation storage twice without altering grants, shared stars or audit history', () => {
    createSchema(db);
    const tables = ['users', 'boards', 'board_memberships', 'board_admin_grants', 'workspace_admin_grants', 'cards', 'audit_events'];
    const before = tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    createSchema(db);
    createSchema(db);
    expect(db.prepare('SELECT * FROM board_invitations').all()).toEqual([]);
    expect(tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())).toEqual(before);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  function insertInvitation(id = 'invite-1', issuer = 'u4', target = 'u2', accepted = false) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO board_invitations (id, board_id, target_user_id, role, token_hash, issuer_user_id, created_at, expires_at, accepted_at)
      VALUES (?, 'b1', ?, 'member', ?, ?, ?, ?, ?)`)
      .run(id, target, `synthetic-hash-${id}`, issuer, now, new Date(Date.now() + 86400000).toISOString(), accepted ? now : null);
  }

  it('permanently revokes invitations after issuer grant loss, including later regrant', () => {
    insertInvitation();
    const grant = db.prepare('SELECT * FROM board_admin_grants WHERE user_id = ?').get('u4') as Record<string, string>;
    db.prepare('DELETE FROM board_admin_grants WHERE user_id = ?').run('u4');
    expect(db.prepare('SELECT revoked_at FROM board_invitations').get()).toEqual({ revoked_at: expect.any(String) });
    db.prepare('INSERT INTO board_admin_grants (id, user_id, board_id, granted_by_user_id, created_at) VALUES (@id, @user_id, @board_id, @granted_by_user_id, @created_at)').run(grant);
    expect(db.prepare('SELECT revoked_at FROM board_invitations').get()).toEqual({ revoked_at: expect.any(String) });
    const audit = db.prepare("SELECT * FROM audit_events WHERE action = 'board.invitation_revoke'").all();
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain('synthetic-hash');
  });

  it('retains invitations when an independent grant still authorizes the issuer', () => {
    insertInvitation();
    db.prepare("INSERT INTO workspace_admin_grants (id, user_id, workspace_id, created_at) VALUES ('extra', 'u4', 'w1', ?)").run(new Date().toISOString());
    db.prepare("DELETE FROM board_admin_grants WHERE user_id = 'u4'").run();
    expect(db.prepare('SELECT revoked_at FROM board_invitations').get()).toEqual({ revoked_at: null });
    db.prepare("DELETE FROM workspace_admin_grants WHERE user_id = 'u4'").run();
    expect(db.prepare('SELECT revoked_at FROM board_invitations').get()).toEqual({ revoked_at: expect.any(String) });
  });

  it('revokes accepted tokens on membership removal without deleting invitation history', () => {
    insertInvitation('accepted', 'u4', 'u3', true);
    db.prepare("DELETE FROM board_memberships WHERE user_id = 'u3' AND board_id = 'b1'").run();
    expect(db.prepare('SELECT accepted_at, revoked_at FROM board_invitations').get()).toEqual({ accepted_at: expect.any(String), revoked_at: expect.any(String) });
  });

  it('retains a revoked record when an issuer is deleted and rolls back a failed revocation audit', () => {
    insertInvitation();
    db.exec("CREATE TRIGGER fail_invitation_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'board.invitation_revoke' BEGIN SELECT RAISE(ABORT, 'Synthetic invitation audit failure'); END;");
    expect(() => db.prepare("DELETE FROM board_admin_grants WHERE user_id = 'u4'").run()).toThrow('Synthetic invitation audit failure');
    expect(db.prepare('SELECT revoked_at FROM board_invitations').get()).toEqual({ revoked_at: null });
    expect(db.prepare("SELECT id FROM board_admin_grants WHERE user_id = 'u4'").get()).toBeDefined();
    db.exec('DROP TRIGGER fail_invitation_audit');
    db.prepare("DELETE FROM users WHERE id = 'u4'").run();
    expect(db.prepare('SELECT issuer_user_id, revoked_at FROM board_invitations').get()).toEqual({ issuer_user_id: null, revoked_at: expect.any(String) });
  });

});
