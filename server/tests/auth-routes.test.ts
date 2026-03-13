// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../src/db/database';
import { createApp } from '../src/app';
import { closeDatabase } from '../src/db/database';

describe('auth routes', () => {
  afterEach(() => {
    closeDatabase();
  });

  it('requires password rotation for the bootstrap admin', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = request.agent(app);

    const login = await agent.post('/api/auth/login').send({ email: 'admin@strata.local', password: 'ChangeMe123!' });
    expect(login.status).toBe(200);
    expect(login.body.status).toBe('password-change-required');

    const changed = await agent.post('/api/auth/password/change').send({ currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!' });
    expect(changed.status).toBe(204);

    const session = await agent.get('/api/auth/session');
    expect(session.status).toBe(200);
    expect(session.body.status).toBe('authenticated');
    expect(session.body.user.email).toBe('admin@strata.local');
    expect(session.body.appState.workspaces.length).toBeGreaterThan(0);
  });

  it('rejects invalid credentials', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);

    const response = await request(app).post('/api/auth/login').send({ email: 'admin@strata.local', password: 'bad-password' });
    expect(response.status).toBe(401);
  });
});
