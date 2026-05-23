// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../src/db/database';
import { createApp } from '../src/app';
import { closeDatabase } from '../src/db/database';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
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

  it('rejects bootstrap when already bootstrapped', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);

    const response = await request(app).post('/api/auth/bootstrap').send({ username: 'newadmin', password: 'Bootstrap12345!', confirmPassword: 'Bootstrap12345!' });
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Platform already bootstrapped.');
  });
});
