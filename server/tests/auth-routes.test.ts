// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase, type DatabaseHandle } from '../src/db/database';
import { createApp } from '../src/app';
import { closeDatabase } from '../src/db/database';
import { createBoard } from '../src/db/repositories';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
});

describe('preference selection', () => {
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();
  const workspaceC = randomUUID();
  const boardA = randomUUID();
  const boardB = randomUUID();
  const boardC = randomUUID();
  const actors = [
    { role: 'System Administrator', userId: 'u1', username: 'admin', password: 'ChangeMe123!' },
    { role: 'Workspace Administrator', userId: 'u2', username: 'alex', password: 'WorkspaceAdmin123!' },
    { role: 'Board Administrator', userId: 'u4', username: 'marcus', password: 'BoardAdmin123!' },
    { role: 'Member', userId: 'u3', username: 'priya', password: 'Member12345!' },
    { role: 'Observer', userId: 'u3', username: 'priya', password: 'Member12345!' },
  ];
  let db: DatabaseHandle;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = await createDatabase(':memory:');
    app = createApp(db);
    const timestamp = new Date().toISOString();
    for (const workspaceId of [workspaceA, workspaceB, workspaceC]) {
      db.prepare('INSERT INTO workspaces (id, name, description, visibility, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(workspaceId, 'Preference workspace', '', 'private', timestamp);
    }
    createBoard(db, boardA, 'Board A', workspaceA, 'private', '#315ddc', '[]');
    createBoard(db, boardB, 'Board B', workspaceB, 'private', '#315ddc', '[]');
    createBoard(db, boardC, 'Board C', workspaceC, 'private', '#315ddc', '[]');
    for (const workspaceId of [workspaceA, workspaceB]) {
      db.prepare('INSERT INTO workspace_admin_grants (id, user_id, workspace_id, created_at) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), 'u2', workspaceId, timestamp);
    }
    for (const boardId of [boardA, boardB]) {
      db.prepare('INSERT INTO board_admin_grants (id, user_id, board_id, created_at) VALUES (?, ?, ?, ?)')
        .run(randomUUID(), 'u4', boardId, timestamp);
      db.prepare('INSERT INTO board_memberships (id, user_id, board_id, role, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), 'u3', boardId, 'member', timestamp);
    }
  });

  afterEach(() => {
    db.close();
  });

  async function signIn(actor = actors[1]) {
    if (actor.role === 'Observer') db.prepare("UPDATE board_memberships SET role = 'observer' WHERE user_id = ?").run(actor.userId);
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ username: actor.username, password: actor.password });
    expect(login.status).toBe(200);
    return agent;
  }

  function preferences(userId = 'u2') {
    return db.prepare('SELECT theme_preference, default_workspace_id, default_board_id, updated_at FROM users WHERE id = ?').get(userId);
  }

  it.each(actors)('allows $role to save only their own accessible matching selection', async actor => {
    const agent = await signIn(actor);
    const others = db.prepare('SELECT id, theme_preference, default_workspace_id, default_board_id, updated_at FROM users WHERE id != ? ORDER BY id').all(actor.userId);

    const response = await agent.patch('/api/auth/preferences').send({
      themePreference: 'light', defaultWorkspaceId: workspaceA, defaultBoardId: boardA,
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ id: actor.userId, themePreference: 'light', defaultWorkspaceId: workspaceA, defaultBoardId: boardA });
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(db.prepare('SELECT id, theme_preference, default_workspace_id, default_board_id, updated_at FROM users WHERE id != ? ORDER BY id').all(actor.userId)).toEqual(others);
    const session = await agent.get('/api/auth/session');
    expect(session.body.user).toMatchObject({ defaultWorkspaceId: workspaceA, defaultBoardId: boardA });
    expect(db.prepare("SELECT actor_user_id, outcome, metadata_json FROM audit_events WHERE action = 'auth.preferences_update'").all()).toEqual([{
      actor_user_id: actor.userId,
      outcome: 'success',
      metadata_json: JSON.stringify({ themePreference: 'light', defaultWorkspaceId: workspaceA, defaultBoardId: boardA }),
    }]);
  });

  it.each(actors)('rejects another accessible workspace’s board for $role without changes or success audit', async actor => {
    const agent = await signIn(actor);
    const before = preferences(actor.userId);

    const response = await agent.patch('/api/auth/preferences').send({
      themePreference: 'light', defaultWorkspaceId: workspaceA, defaultBoardId: boardB,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: 'DEFAULT_SELECTION_INVALID', message: 'Invalid default selection.' });
    expect(preferences(actor.userId)).toEqual(before);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'auth.preferences_update'").all()).toEqual([]);
  });

  it('clears the previous board when changing workspace without supplying a board', async () => {
    db.prepare('UPDATE users SET default_workspace_id = ?, default_board_id = ? WHERE id = ?').run(workspaceA, boardA, 'u2');
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' });

    const response = await agent.patch('/api/auth/preferences').send({ defaultWorkspaceId: workspaceB });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ defaultWorkspaceId: workspaceB, defaultBoardId: null });
    const session = await agent.get('/api/auth/session');
    expect(session.body.user).toMatchObject({ defaultWorkspaceId: workspaceB, defaultBoardId: null });
  });

  it.each([
    { name: 'theme only', body: { themePreference: 'light' }, workspace: workspaceA, board: boardA, theme: 'light' },
    { name: 'same workspace', body: { defaultWorkspaceId: workspaceA }, workspace: workspaceA, board: boardA, theme: 'dark' },
    { name: 'clear board', body: { defaultBoardId: null }, workspace: workspaceA, board: null, theme: 'dark' },
    { name: 'clear workspace', body: { defaultWorkspaceId: null }, workspace: null, board: null, theme: 'dark' },
    { name: 'clear both', body: { defaultWorkspaceId: null, defaultBoardId: null }, workspace: null, board: null, theme: 'dark' },
  ])('preserves omitted fields and applies explicit null for $name', async ({ body, workspace, board, theme }) => {
    db.prepare('UPDATE users SET default_workspace_id = ?, default_board_id = ? WHERE id = ?').run(workspaceA, boardA, 'u2');
    const agent = await signIn();

    const response = await agent.patch('/api/auth/preferences').send(body);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ themePreference: theme, defaultWorkspaceId: workspace, defaultBoardId: board });
    const session = await agent.get('/api/auth/session');
    expect(session.body.user).toMatchObject({ themePreference: theme, defaultWorkspaceId: workspace, defaultBoardId: board });
  });

  it.each([
    { name: 'inaccessible workspace', workspace: workspaceC, board: null },
    { name: 'missing workspace', workspace: randomUUID(), board: null },
    { name: 'inaccessible board', workspace: workspaceA, board: boardC },
    { name: 'missing board', workspace: workspaceA, board: randomUUID() },
  ])('returns the same safe error for $name', async ({ workspace, board }) => {
    const agent = await signIn();
    const before = preferences();

    const response = await agent.patch('/api/auth/preferences').send({
      themePreference: 'light', defaultWorkspaceId: workspace, defaultBoardId: board,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: 'DEFAULT_SELECTION_INVALID', message: 'Invalid default selection.' });
    expect(preferences()).toEqual(before);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'auth.preferences_update'").all()).toEqual([]);
  });

  it('validates saved defaults after access revocation even on a theme-only patch', async () => {
    db.prepare('UPDATE users SET default_workspace_id = ?, default_board_id = ? WHERE id = ?').run(workspaceA, boardA, 'u2');
    const agent = await signIn();
    db.prepare('DELETE FROM workspace_admin_grants WHERE user_id = ? AND workspace_id = ?').run('u2', workspaceA);
    const before = preferences();

    const response = await agent.patch('/api/auth/preferences').send({ themePreference: 'light' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('DEFAULT_SELECTION_INVALID');
    expect(preferences()).toEqual(before);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'auth.preferences_update'").all()).toEqual([]);
    const cleared = await agent.patch('/api/auth/preferences').send({ defaultWorkspaceId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.user).toMatchObject({ defaultWorkspaceId: null, defaultBoardId: null });
  });

  it('denies an unshared sibling board even when its workspace is accessible', async () => {
    const sibling = randomUUID();
    createBoard(db, sibling, 'Unshared sibling', workspaceA, 'private', '#315ddc', '[]');
    const agent = await signIn(actors[3]);
    const before = preferences('u3');

    const response = await agent.patch('/api/auth/preferences').send({ defaultWorkspaceId: workspaceA, defaultBoardId: sibling });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: 'DEFAULT_SELECTION_INVALID', message: 'Invalid default selection.' });
    expect(preferences('u3')).toEqual(before);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'auth.preferences_update'").all()).toEqual([]);
  });

  it('rolls back all preference changes when the success audit cannot be written', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' });
    const before = db.prepare('SELECT theme_preference, default_workspace_id, default_board_id, updated_at FROM users WHERE id = ?').get('u2');
    db.exec(`
      CREATE TRIGGER fail_preference_audit BEFORE INSERT ON audit_events
      WHEN NEW.action = 'auth.preferences_update'
      BEGIN SELECT RAISE(ABORT, 'Synthetic preference audit failure'); END;
    `);

    const response = await agent.patch('/api/auth/preferences').send({
      themePreference: 'light', defaultWorkspaceId: workspaceA, defaultBoardId: boardA,
    });

    expect(response.status).toBe(500);
    expect(db.prepare('SELECT theme_preference, default_workspace_id, default_board_id, updated_at FROM users WHERE id = ?').get('u2')).toEqual(before);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'auth.preferences_update'").all()).toEqual([]);
  });

  it.each([
    { name: 'invalid UUID', body: { defaultWorkspaceId: 'invalid' } },
    { name: 'invalid theme', body: { themePreference: 'sepia' } },
    { name: 'board without workspace', body: { defaultBoardId: boardA } },
    { name: 'board with null workspace', body: { defaultWorkspaceId: null, defaultBoardId: boardA } },
  ])('returns the stable schema error for $name without changes or success audit', async ({ body }) => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' });
    const before = db.prepare('SELECT theme_preference, default_workspace_id, default_board_id, updated_at FROM users WHERE id = ?').get('u2');

    const response = await agent.patch('/api/auth/preferences').send({ themePreference: 'light', ...body });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'PREFERENCES_INVALID', message: expect.any(String) });
    expect(db.prepare('SELECT theme_preference, default_workspace_id, default_board_id, updated_at FROM users WHERE id = ?').get('u2')).toEqual(before);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'auth.preferences_update'").all()).toEqual([]);
  });

  it('requires authentication before changing preferences', async () => {
    const before = preferences();
    const response = await request(app).patch('/api/auth/preferences').send({ themePreference: 'light' });
    expect(response.status).toBe(401);
    expect(preferences()).toEqual(before);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'auth.preferences_update'").all()).toEqual([]);
  });
});

describe('auth routes', () => {
  afterEach(() => {
    closeDatabase();
  });

  it('requires password rotation for the bootstrap admin', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = request.agent(app);

    const login = await agent.post('/api/auth/login').send({ username: 'admin', password: 'ChangeMe123!' });
    expect(login.status).toBe(200);
    expect(login.body.status).toBe('password-change-required');

    const changed = await agent.post('/api/auth/password/change').send({ currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!', confirmPassword: 'ChangeThisNow123!' });
    expect(changed.status).toBe(204);

    const session = await agent.get('/api/auth/session');
    expect(session.status).toBe(200);
    expect(session.body.status).toBe('authenticated');
    expect(session.body.user.username).toBe('admin');
    expect(session.body.user.themePreference).toBe('dark');
    expect(session.body.appState.workspaces.length).toBeGreaterThan(0);
  });

  it('allows authenticated users to update their own profile details', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = request.agent(app);

    const login = await agent.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' });
    expect(login.status).toBe(200);

    const updated = await agent.patch('/api/auth/profile').send({
      name: 'Alex Rivers',
      initials: 'AR',
      color: '#315ddc',
    });

    expect(updated.status).toBe(200);
    expect(updated.body.user.name).toBe('Alex Rivers');
    expect(updated.body.user.initials).toBe('AR');
    expect(updated.body.user.color).toBe('#315ddc');
    expect(updated.body.user.themePreference).toBe('dark');

    const session = await agent.get('/api/auth/session');
    expect(session.status).toBe(200);
    expect(session.body.user.name).toBe('Alex Rivers');
    expect(session.body.user.initials).toBe('AR');
    expect(session.body.user.color).toBe('#315ddc');
  });

  it('persists theme preference changes for future session refreshes', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = request.agent(app);

    const login = await agent.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' });
    expect(login.status).toBe(200);
    expect(login.body.user.themePreference).toBe('dark');

    const updated = await agent.patch('/api/auth/preferences').send({ themePreference: 'light' });
    expect(updated.status).toBe(200);
    expect(updated.body.user.themePreference).toBe('light');

    const session = await agent.get('/api/auth/session');
    expect(session.status).toBe(200);
    expect(session.body.user.themePreference).toBe('light');
  });

  it('rejects invalid credentials', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);

    const response = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'bad-password' });
    expect(response.status).toBe(401);
  });

  it('checks bootstrap status', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);

    const response = await request(app).get('/api/auth/needs-bootstrap');
    expect(response.status).toBe(200);
    expect(response.body.needsBootstrap).toBe(false);
  });
});
