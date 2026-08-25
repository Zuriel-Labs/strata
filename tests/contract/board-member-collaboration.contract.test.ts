// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { closeDatabase, createDatabase } from '../../server/src/db/database';
import { createApp } from '../../server/src/app';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
});

async function login(app: ReturnType<typeof createApp>, username: string, password: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username, password });
  return agent;
}

describe('Board Member collaboration contract', () => {
  afterEach(() => closeDatabase());

  it('publishes the collaboration, comment ownership, and automation edit endpoints', () => {
    const contract = readFileSync('specs/030-board-member-permissions/contracts/board-member-collaboration.openapi.yaml', 'utf8');
    expect(contract).toContain('/api/cards/{cardId}/move:');
    expect(contract).toContain('/api/cards/{cardId}/duplicate:');
    expect(contract).toContain('/api/cards/{cardId}/comments:');
    expect(contract).toContain('/api/cards/{cardId}/comments/{commentId}:');
    expect(contract).toContain('/api/automation-rules/{ruleId}:');
    expect(contract.match(/additionalProperties: false/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('enforces strict comment ownership shapes and excludes movement from generic card updates', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const member = await login(app, 'priya', 'Member12345!');

    expect((await member.patch('/api/cards/c5').send({ listId: 'l2', position: 0 })).status).toBe(400);
    expect((await member.patch('/api/cards/c5').send({ comments: [] })).status).toBe(400);
    expect((await member.post('/api/cards/c5/comments').send({ text: 'Contract', userId: 'u1' })).status).toBe(400);

    const created = await member.post('/api/cards/c5/comments').send({ text: 'Contract comment' });
    expect(created.status).toBe(201);
    const comment = created.body.comments.at(-1);
    expect(comment).toMatchObject({ userId: 'u3', text: 'Contract comment' });
    expect((await member.patch(`/api/cards/c5/comments/${comment.id}`).send({ text: 'Edited contract comment' })).status).toBe(200);
    expect((await member.delete(`/api/cards/c5/comments/${comment.id}`)).status).toBe(403);
  });

  it('keeps automation editing administrative and Board-scoped', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const member = await login(app, 'priya', 'Member12345!');
    const boardAdmin = await login(app, 'marcus', 'BoardAdmin123!');

    expect((await member.patch('/api/automation-rules/ar2').send({ name: 'Denied' })).status).toBe(403);
    const updated = await boardAdmin.patch('/api/automation-rules/ar2').send({ name: 'Contract admin edit' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ id: 'ar2', boardId: 'b1', name: 'Contract admin edit' });
    expect((await boardAdmin.patch('/api/automation-rules/ar2').send({ boardId: 'b2' })).status).toBe(400);
  });
});
