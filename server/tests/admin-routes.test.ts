// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../src/db/database';
import { createApp } from '../src/app';
import { closeDatabase } from '../src/db/database';

async function loginAsAdmin(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'admin@strata.local', password: 'ChangeMe123!' });
  await agent.post('/api/auth/password/change').send({ currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!' });
  return agent;
}

describe('admin routes', () => {
  afterEach(() => {
    closeDatabase();
  });

  it('creates a managed user and resets their password', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAsAdmin(app);

    const createResponse = await agent.post('/api/admin/users').send({
      name: 'Jordan Lee',
      initials: 'JL',
      color: '#2563eb',
      email: 'jordan@strata.local',
      platformRole: 'user',
      active: true,
      workspaceMemberships: [{ workspaceId: 'w1', role: 'member' }],
      boardMemberships: [{ boardId: 'b1', role: 'observer' }],
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.temporaryPassword).toBeTruthy();

    const resetResponse = await agent.post(`/api/admin/users/${createResponse.body.user.id}/reset-password`);
    expect(resetResponse.status).toBe(200);
    expect(resetResponse.body.temporaryPassword).toBeTruthy();
  });
});
