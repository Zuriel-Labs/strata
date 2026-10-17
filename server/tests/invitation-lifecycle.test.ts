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

  it.each(['deactivation', 'demotion'])('permanently revokes after issuer %s even if authority returns', kind => {
    if (kind === 'demotion') {
      db.prepare("UPDATE users SET platform_role = 'system_admin' WHERE id = 'u4'").run();
      db.prepare("DELETE FROM board_admin_grants WHERE user_id = 'u4'").run();
    }
    insertInvitation();
    if (kind === 'deactivation') {
      db.prepare("UPDATE users SET active = 0 WHERE id = 'u4'").run();
      db.prepare("UPDATE users SET active = 1 WHERE id = 'u4'").run();
    } else {
      db.prepare("UPDATE users SET platform_role = 'user' WHERE id = 'u4'").run();
      db.prepare("UPDATE users SET platform_role = 'system_admin' WHERE id = 'u4'").run();
    }
    expect(db.prepare('SELECT revoked_at FROM board_invitations').get()).toEqual({ revoked_at: expect.any(String) });
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'board.invitation_revoke'").all()).toHaveLength(1);
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
    expect(listed.body.items[0].targetName).toBe(getUserById(db, 'u2')?.name);
    expect(listed.body.items[0].targetUsername).toBe(getUserById(db, 'u2')?.username);
    expect(JSON.stringify(listed.body)).not.toMatch(/token|hash/);
    const memberships = db.prepare('SELECT * FROM board_memberships ORDER BY id').all();
    for (let n = 0; n < 2; n++) expect((await agent.delete(`/api/admin/boards/b1/invitations/${created.body.invitation.id}`)).status).toBe(204);
    expect((await agent.get('/api/admin/boards/b1/invitations')).body.items).toEqual([]);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'board.invitation_revoke'").all()).toHaveLength(1);
    expect(db.prepare('SELECT * FROM board_memberships ORDER BY id').all()).toEqual(memberships);
    expect((await agent.get('/api/admin/boards/b1/invitations?pageSize=51')).status).toBe(400);
    expect((await agent.get('/api/admin/boards/b3/invitations')).status).toBe(403);
  });

  it('accepts only for the bound recipient, rotates sessions and retries without a second membership', async () => {
    const app = createApp(db);
    const issuer = request.agent(app);
    const target = request.agent(app);
    const old = request.agent(app);
    expect((await issuer.post('/api/auth/login').send({ username: 'marcus', password: 'BoardAdmin123!' })).status).toBe(200);
    for (const agent of [target, old]) expect((await agent.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' })).status).toBe(200);
    const created = await issuer.post('/api/admin/boards/b1/invitations').send({ targetUserId: 'u2', role: 'observer', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    expect(created.status).toBe(201);
    const accepted = await target.post('/api/auth/board-invitations/accept').send({ token: created.body.token });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ boardId: 'b1', membershipRole: 'observer', alreadyAccepted: false });
    expect(accepted.headers['set-cookie']).toBeDefined();
    expect((await old.get('/api/auth/session')).status).toBe(401);
    expect((await target.get('/api/auth/session')).status).toBe(200);
    const retry = await target.post('/api/auth/board-invitations/accept').send({ token: created.body.token });
    expect(retry.body).toEqual({ boardId: 'b1', membershipRole: 'observer', alreadyAccepted: true });
    expect(db.prepare("SELECT id FROM board_memberships WHERE user_id = 'u2' AND board_id = 'b1'").all()).toHaveLength(1);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'board.invitation_accept' AND outcome = 'success'").all()).toHaveLength(1);
  });

  async function issueForAlex() {
    const app = createApp(db);
    const issuer = request.agent(app);
    const target = request.agent(app);
    expect((await issuer.post('/api/auth/login').send({ username: 'marcus', password: 'BoardAdmin123!' })).status).toBe(200);
    expect((await target.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' })).status).toBe(200);
    const created = await issuer.post('/api/admin/boards/b1/invitations').send({ targetUserId: 'u2', role: 'observer', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    expect(created.status).toBe(201);
    return { app, issuer, target, token: String(created.body.token), invitationId: String(created.body.invitation.id) };
  }

  it.each(['expired', 'revoked', 'wrong recipient', 'issuer lost and regained authority', 'unknown'])('rejects %s with the same unavailable response and no membership', async scenario => {
    const context = await issueForAlex();
    if (scenario === 'expired') db.prepare('UPDATE board_invitations SET expires_at = ?').run(new Date(Date.now() - 1000).toISOString());
    if (scenario === 'revoked') await context.issuer.delete(`/api/admin/boards/b1/invitations/${context.invitationId}`);
    if (scenario === 'issuer lost and regained authority') {
      db.prepare("DELETE FROM board_admin_grants WHERE user_id = 'u4'").run();
      replaceAssignments(db, 'u1', 'u4', { workspaceAdminWorkspaceIds: [], boardAdminBoardIds: ['b1'], boardMemberships: [] });
    }
    const caller = scenario === 'wrong recipient' ? context.issuer : context.target;
    const result = await caller.post('/api/auth/board-invitations/accept').send({ token: scenario === 'unknown' ? `bi_${'0'.repeat(64)}` : context.token });
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ code: 'INVITATION_UNAVAILABLE', message: 'Invitation unavailable.' });
    expect(db.prepare("SELECT id FROM board_memberships WHERE user_id = 'u2' AND board_id = 'b1'").all()).toEqual([]);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'board.invitation_accept' AND outcome = 'success'").all()).toEqual([]);
  });

  it('rolls back membership, acceptance and all session changes if acceptance audit fails', async () => {
    const { target, token } = await issueForAlex();
    const sessions = db.prepare("SELECT * FROM sessions WHERE user_id = 'u2' ORDER BY id").all();
    db.exec("CREATE TRIGGER fail_accept_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'board.invitation_accept' AND NEW.outcome = 'success' BEGIN SELECT RAISE(ABORT, 'Synthetic acceptance failure'); END;");
    const result = await target.post('/api/auth/board-invitations/accept').send({ token });
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ message: 'Unable to accept invitation.' });
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(db.prepare("SELECT id FROM board_memberships WHERE user_id = 'u2' AND board_id = 'b1'").all()).toEqual([]);
    expect(db.prepare('SELECT accepted_at FROM board_invitations').get()).toEqual({ accepted_at: null });
    expect(db.prepare("SELECT id FROM sessions WHERE user_id = 'u2' ORDER BY id").all()).toEqual(sessions.map(row => ({ id: (row as { id: string }).id })));
    expect((await target.get('/api/auth/session')).status).toBe(200);
  });

  it('never changes an existing membership role or recreates removed acceptance', async () => {
    const { target, issuer, token } = await issueForAlex();
    db.prepare("INSERT INTO board_memberships (id, user_id, board_id, role, created_at) VALUES ('existing', 'u2', 'b1', 'member', ?)").run(new Date().toISOString());
    expect((await target.post('/api/auth/board-invitations/accept').send({ token })).status).toBe(409);
    expect(db.prepare("SELECT role FROM board_memberships WHERE id = 'existing'").get()).toEqual({ role: 'member' });
    db.prepare("DELETE FROM board_memberships WHERE id = 'existing'").run();
    expect((await target.post('/api/auth/board-invitations/accept').send({ token })).status).toBe(200);
    expect((await issuer.delete('/api/admin/boards/b1/members/u2')).status).toBe(200);
    await target.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' });
    expect((await target.post('/api/auth/board-invitations/accept').send({ token })).status).toBe(404);
    expect(db.prepare("SELECT id FROM board_memberships WHERE user_id = 'u2' AND board_id = 'b1'").all()).toEqual([]);
  });

  it('bounds issuance and management inputs without creating accounts or privileged invitations', async () => {
    const { app, issuer, target, token } = await issueForAlex();
    const users = db.prepare('SELECT COUNT(*) AS count FROM users').get();
    const valid = { targetUserId: 'u2', role: 'member', expiresAt: new Date(Date.now() + 86400000).toISOString() };
    for (const body of [{ ...valid, expiresAt: new Date(Date.now() + 8 * 86400000).toISOString() }, { ...valid, expiresAt: new Date(Date.now() - 1000).toISOString() }, { ...valid, role: 'system_admin' }, { ...valid, targetUserId: 'missing' }, { ...valid, userId: 'u1' }]) {
      expect((await issuer.post('/api/admin/boards/b1/invitations').send(body)).status).toBe(400);
    }
    const member = request.agent(app);
    await member.post('/api/auth/login').send({ username: 'priya', password: 'Member12345!' });
    for (const [agent, boardId] of [[member, 'b1'], [issuer, 'b2'], [issuer, 'b3']] as const) {
      expect((await agent.post(`/api/admin/boards/${boardId}/invitations`).send(valid)).status).toBe(403);
    }
    expect((await request(app).post('/api/auth/board-invitations/accept').send({ token })).status).toBe(401);
    expect((await target.post('/api/auth/board-invitations/accept').send({ token, userId: 'u1' })).status).toBe(400);
    expect((await target.post('/api/auth/board-invitations/accept').send({ token: '0'.repeat(64) })).status).toBe(400);
    expect((await issuer.delete('/api/admin/boards/b1/invitations/invalid-id')).status).toBe(400);
    for (const query of ['page=0', 'pageSize=51', 'status=accepted', 'userId=u1']) expect((await issuer.get(`/api/admin/boards/b1/invitations?${query}`)).status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual(users);
    expect(db.prepare('SELECT id FROM board_invitations').all()).toHaveLength(1);
  });

  it('commits at most one membership and success audit when acceptance races', async () => {
    const { app, target, token } = await issueForAlex();
    const other = request.agent(app);
    expect((await other.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' })).status).toBe(200);
    const results = await Promise.all([target, other].map(agent => agent.post('/api/auth/board-invitations/accept').send({ token })));
    expect(results.map(result => result.status).sort()).toEqual([200, 401]);
    expect(db.prepare("SELECT id FROM board_memberships WHERE user_id = 'u2' AND board_id = 'b1'").all()).toHaveLength(1);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'board.invitation_accept' AND outcome = 'success'").all()).toHaveLength(1);
    const winner = results[0].status === 200 ? target : other;
    expect((await winner.post('/api/auth/board-invitations/accept').send({ token })).body.alreadyAccepted).toBe(true);
  });

  it('binds a renamed recipient by ID and projects new access without granting sibling mutations', async () => {
    const app = createApp(db);
    const issuer = request.agent(app);
    const target = request.agent(app);
    await issuer.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' });
    await target.post('/api/auth/login').send({ username: 'priya', password: 'Member12345!' });
    const created = await issuer.post('/api/admin/boards/b2/invitations').send({ targetUserId: 'u3', role: 'observer', expiresAt: new Date(Date.now() + 86400000).toISOString() });
    expect(created.status).toBe(201);
    db.prepare("UPDATE users SET username = 'renamed-recipient' WHERE id = 'u3'").run();
    expect((await target.post('/api/auth/board-invitations/accept').send({ token: created.body.token })).status).toBe(200);
    const session = await target.get('/api/auth/session');
    expect(session.body.appState.boards.map((board: { id: string }) => board.id)).toContain('b2');
    expect(session.body.permissions.workspaceAdminGrants).toEqual([]);
    expect(session.body.permissions.boardAdminGrants).toEqual([]);
    expect((await target.post('/api/admin/boards/b2/invitations').send({})).status).toBe(403);
    expect((await target.patch('/api/boards/b2/star')).status).toBe(403);
  });

});
