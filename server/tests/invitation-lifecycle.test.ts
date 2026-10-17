// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from '../src/db/database';
import request from 'supertest';
import { createApp } from '../src/app';
import { createSchema } from '../src/db/schema';
import { getUserById } from '../src/db/repositories';
import { replaceAssignments, updateManagedUser } from '../src/db/admin-repositories';

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

  it('preserves pending invitations across an atomic change to equivalent effective authority', () => {
    db.prepare("UPDATE users SET platform_role = 'system_admin' WHERE id = 'u4'").run();
    replaceAssignments(db, 'u1', 'u4', { workspaceAdminWorkspaceIds: [], boardAdminBoardIds: [], boardMemberships: [] });
    insertInvitation();
    const actor = getUserById(db, 'u1');
    if (!actor) throw new Error('Expected administrator fixture');
    updateManagedUser(db, actor, 'u4', { platformRole: 'user', workspaceAdminWorkspaceIds: ['w1'], boardAdminBoardIds: [], boardMemberships: [] });
    expect(db.prepare('SELECT revoked_at FROM board_invitations').get()).toEqual({ revoked_at: null });
    updateManagedUser(db, actor, 'u4', { platformRole: 'system_admin', workspaceAdminWorkspaceIds: [], boardAdminBoardIds: [], boardMemberships: [] });
    expect(db.prepare('SELECT revoked_at FROM board_invitations').get()).toEqual({ revoked_at: null });
  });

  it('issues a distinct one-time invitation for an existing account without granting membership', async () => {
    const agent = request.agent(createApp(db));
    expect((await agent.post('/api/auth/login').send({ username: 'marcus', password: 'BoardAdmin123!' })).status).toBe(200);
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    const created = await agent.post('/api/admin/boards/b1/invitations').send({ targetUserId: 'u2', role: 'observer', expiresAt });
    expect(created.status).toBe(201);
    expect(created.body.invitation).toMatchObject({ boardId: 'b1', targetUserId: 'u2', role: 'observer', expiresAt, status: 'pending' });
    expect(created.body.token).toMatch(/^bi_[a-f0-9]{64}$/);
    expect(db.prepare("SELECT id FROM board_memberships WHERE user_id = 'u2' AND board_id = 'b1'").get()).toBeUndefined();
    const stored = db.prepare('SELECT * FROM board_invitations').all();
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(created.body.token);
    const audited = db.prepare("SELECT * FROM audit_events WHERE action = 'board.invitation_create'").all();
    expect(audited).toHaveLength(1);
    expect(JSON.stringify(audited)).not.toContain(created.body.token);
  });

  it('lists only bounded invitation metadata and revokes idempotently without changing memberships', async () => {
    const agent = request.agent(createApp(db));
    expect((await agent.post('/api/auth/login').send({ username: 'marcus', password: 'BoardAdmin123!' })).status).toBe(200);
    const created = await agent.post('/api/admin/boards/b1/invitations').send({ targetUserId: 'u2', role: 'member', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    expect(created.status).toBe(201);
    const listed = await agent.get('/api/admin/boards/b1/invitations?status=pending&page=1&pageSize=1');
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0]).toMatchObject({ id: created.body.invitation.id, targetUserId: 'u2', status: 'pending' });
    expect(JSON.stringify(listed.body)).not.toMatch(/token|hash/);
    const memberships = db.prepare('SELECT * FROM board_memberships ORDER BY id').all();
    for (let n = 0; n < 2; n++) expect((await agent.delete(`/api/admin/boards/b1/invitations/${created.body.invitation.id}`)).status).toBe(204);
    expect((await agent.get('/api/admin/boards/b1/invitations')).body.items).toEqual([]);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'board.invitation_revoke'").all()).toHaveLength(1);
    expect(db.prepare('SELECT * FROM board_memberships ORDER BY id').all()).toEqual(memberships);
    expect((await agent.get('/api/admin/boards/b1/invitations?pageSize=51')).status).toBe(400);
    expect((await agent.get('/api/admin/boards/b3/invitations')).status).toBe(403);
  });

});
