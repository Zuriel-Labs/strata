// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../src/db/database';
import { createApp } from '../src/app';
import { closeDatabase } from '../src/db/database';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
});

describe('rbac matrix', () => {
  afterEach(() => {
    closeDatabase();
  });

  it('filters bootstrap data to the signed-in user scope', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = request.agent(app);

    await agent.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' });
    const session = await agent.get('/api/auth/session');

    expect(session.status).toBe(200);
    expect(session.body.appState.workspaces.some((workspace: { id: string }) => workspace.id === 'w1')).toBe(true);
    expect(session.body.appState.workspaces.some((workspace: { id: string }) => workspace.id === 'w2')).toBe(false);
  });

  it('allows scoped administrators into the bounded administration directory', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = request.agent(app);

    await agent.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' });
    const response = await agent.get('/api/admin/users');

    expect(response.status).toBe(200);
    expect(response.body.actorCapabilities).toEqual({
      canCreateUsers: false,
      canManageAccess: false,
      canViewAudit: false,
    });
  });
});
