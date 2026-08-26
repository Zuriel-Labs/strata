// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { closeDatabase, createDatabase } from '../../server/src/db/database';
import { createApp } from '../../server/src/app';

beforeAll(() => { process.env.SEED_DATA = 'true'; });

async function adminAgent(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'ChangeMe123!' });
  await agent.post('/api/auth/password/change').send({ currentPassword: 'ChangeMe123!', nextPassword: 'LabelContract123!', confirmPassword: 'LabelContract123!' });
  return agent;
}

describe.sequential('scalable label management contract', () => {
  afterEach(() => closeDatabase());

  it('publishes strict policy, revision, limit, and conflict shapes', () => {
    const contract = readFileSync('specs/034-scalable-label-management/contracts/scalable-label-management.openapi.yaml', 'utf8');
    expect(contract).toContain('/api/admin/settings/label-policy:');
    expect(contract).toContain('/api/boards/{boardId}/labels:');
    expect(contract).toContain('required: [labels, expectedRevision]');
    expect(contract).toContain('LABEL_LIMIT_EXCEEDED');
    expect(contract).toContain('LABEL_VERSION_CONFLICT');
    expect(contract).toContain('maximum: 100');
  });

  it('returns the effective policy and revision in session and label mutation responses', async () => {
    const db = await createDatabase(':memory:'); const app = createApp(db); const agent = await adminAgent(app);
    const session = await agent.get('/api/auth/session');
    expect(session.body.appState.maxLabelsPerBoard).toBe(12);
    expect(session.body.appState.boards[0]).toHaveProperty('labelsRevision', 0);

    const updated = await agent.put('/api/boards/b1/labels').send({ labels: [{ id: 'contract-label', name: 'Contract', color: '#123456' }], expectedRevision: 0 });
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ boardId: 'b1', labels: [{ id: 'contract-label', name: 'Contract', color: '#123456' }], labelsRevision: 1, maxLabelsPerBoard: 12 });
  });

  it('uses machine-readable errors without leaking stored label content', async () => {
    const db = await createDatabase(':memory:'); const app = createApp(db); const agent = await adminAgent(app);
    const duplicate = await agent.put('/api/boards/b1/labels').send({ labels: [{ id: 'same', name: 'One', color: '#123456' }, { id: 'same', name: 'Two', color: '#654321' }], expectedRevision: 0 });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body).toMatchObject({ code: 'LABEL_DEFINITION_INVALID', message: 'Invalid label payload.' });
    expect(JSON.stringify(duplicate.body)).not.toContain('One');
    expect(JSON.stringify(duplicate.body)).not.toContain('Two');
  });
});
