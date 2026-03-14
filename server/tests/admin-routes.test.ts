// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../src/db/database';
import { createApp } from '../src/app';
import { closeDatabase } from '../src/db/database';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
});

async function loginAsAdmin(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'ChangeMe123!' });
  await agent.post('/api/auth/password/change').send({ currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!', confirmPassword: 'ChangeThisNow123!' });
  return agent;
}

describe('admin routes', () => {
  afterEach(() => {
    closeDatabase();
  });

  it('creates a managed user with invite token and generates a recovery key', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAsAdmin(app);

    const createResponse = await agent.post('/api/admin/users').send({
      name: 'Jordan Lee',
      initials: 'JL',
      color: '#2563eb',
      username: 'jordan',
      platformRole: 'user',
      active: true,
      workspaceMemberships: [{ workspaceId: 'w1', role: 'member' }],
      boardMemberships: [{ boardId: 'b1', role: 'observer' }],
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.inviteToken).toBeTruthy();
    expect(createResponse.body.inviteToken).toHaveLength(64);

    // The invite token acts as the user's first recovery key —
    // consuming it via the recovery flow should work and return a new key
    const consumeResponse = await request(app).post('/api/auth/recovery-key/consume').send({
      username: 'jordan',
      recoveryKey: createResponse.body.inviteToken,
      newPassword: 'MyNewSecurePass1!',
      confirmPassword: 'MyNewSecurePass1!',
    });
    expect(consumeResponse.status).toBe(200);
    expect(consumeResponse.body.newRecoveryKey).toBeTruthy();
    expect(consumeResponse.body.newRecoveryKey).toHaveLength(64);

    // Admin can still generate a new recovery key for the user
    const recoveryResponse = await agent.post(`/api/admin/users/${createResponse.body.user.id}/generate-recovery-key`);
    expect(recoveryResponse.status).toBe(200);
    expect(recoveryResponse.body.recoveryKey).toBeTruthy();
    expect(recoveryResponse.body.recoveryKey).toHaveLength(64);
  });
});
