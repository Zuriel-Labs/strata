// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { closeDatabase, createDatabase } from '../../server/src/db/database';
import { createApp } from '../../server/src/app';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
});

async function adminAgent(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'ChangeMe123!' });
  await agent.post('/api/auth/password/change').send({ currentPassword: 'ChangeMe123!', nextPassword: 'ContractAdmin123!', confirmPassword: 'ContractAdmin123!' });
  return agent;
}

describe.sequential('kanban productivity OpenAPI contract', () => {
  afterEach(() => closeDatabase());

  it('publishes every changed endpoint and strict request shape', () => {
    const contract = readFileSync('specs/011-kanban-productivity-suite/contracts/kanban-productivity.openapi.yaml', 'utf8');
    expect(contract).toContain('/cards/{cardId}/move:');
    expect(contract).toContain('/lists/{listId}/sort:');
    expect(contract).toContain('/cards/{cardId}/duplicate:');
    expect(contract).toContain('/boards/{boardId}/labels:');
    expect(contract).toContain('descriptionDocument:');
    expect(contract.match(/additionalProperties: false/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('requires authentication and returns JSON message envelopes', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const calls = [
      request(app).post('/api/cards/c5/move').send({ toListId: 'l1', toPosition: 0 }),
      request(app).post('/api/lists/l1/sort').send({ direction: 'asc' }),
      request(app).post('/api/cards/c5/duplicate').send({}),
      request(app).put('/api/boards/b1/labels').send({ labels: [] }),
      request(app).patch('/api/cards/c5').send({ descriptionDocument: { type: 'doc', content: [] } }),
    ];

    for (const call of calls) {
      const response = await call;
      expect(response.status).toBe(401);
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.body).toEqual({ message: expect.any(String) });
    }
  });

  it('rejects unknown fields and mutually exclusive or unsafe rich-text input', async () => {
    const db = await createDatabase(':memory:');
    const agent = await adminAgent(createApp(db));

    expect((await agent.post('/api/lists/l1/sort').send({ direction: 'asc', unknown: true })).body).toEqual({ message: 'Invalid sort payload.' });
    expect((await agent.post('/api/cards/c5/duplicate').send({ unknown: true })).body).toEqual({ message: 'Invalid payload.' });
    expect((await agent.post('/api/cards/c5/move').send({ toListId: 'l1', toPosition: 0, unknown: true })).status).toBe(400);
    expect((await agent.patch('/api/cards/c5').send({ title: 'Known', unknown: true })).status).toBe(400);
    expect((await agent.patch('/api/cards/c5').send({ description: 'legacy', descriptionDocument: { type: 'doc', content: [] } })).status).toBe(400);
    const unsafe = await agent.patch('/api/cards/c5').send({
      descriptionDocument: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'unsafe', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }],
      },
    });
    expect(unsafe.status).toBe(400);
    expect(unsafe.body).toEqual({ message: expect.any(String) });
  });

  it('round-trips the structured description and returns authoritative sort and duplicate bodies', async () => {
    const db = await createDatabase(':memory:');
    const agent = await adminAgent(createApp(db));
    const descriptionDocument = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Plan', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second line' }] },
      ],
    };

    const updated = await agent.patch('/api/cards/c5').send({ descriptionDocument });
    expect(updated.status).toBe(200);
    expect(updated.headers['content-type']).toMatch(/^application\/json/);
    expect(updated.body.descriptionDocument).toEqual(descriptionDocument);
    expect(updated.body.description).toBe('Plan\nSecond line');

    const sorted = await agent.post('/api/lists/l1/sort').send({ direction: 'desc' });
    expect(sorted.status).toBe(200);
    expect(sorted.body).toEqual({ listId: 'l1', direction: 'desc', cards: expect.any(Array) });
    expect(sorted.body.cards.every((card: Record<string, unknown>) => card.descriptionDocument)).toBe(true);

    const duplicated = await agent.post('/api/cards/c5/duplicate').send({});
    expect(duplicated.status).toBe(201);
    expect(duplicated.body).toMatchObject({ title: 'Evaluate state management options (copy)', descriptionDocument });
  });

  it('rejects cross-board label references and preserves canonical error content types', async () => {
    const db = await createDatabase(':memory:');
    const agent = await adminAgent(createApp(db));
    const invalid = await agent.patch('/api/cards/c5').send({ labelIds: ['lb-other-board'] });
    expect(invalid.status).toBe(400);
    expect(invalid.headers['content-type']).toMatch(/^application\/json/);
    expect(invalid.body).toEqual({ message: 'One or more labels do not belong to this board.' });
  });
});
