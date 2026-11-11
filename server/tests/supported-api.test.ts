// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase, type DatabaseHandle } from '../src/db/database';
import { createApp } from '../src/app';

describe('supported API authentication', () => {
  let db: DatabaseHandle;
  let app: ReturnType<typeof createApp>;
  beforeEach(async () => { process.env.SEED_DATA = 'true'; db = await createDatabase(':memory:'); app = createApp(db); });
  afterEach(() => db.close());
  it('rejects missing and invalid API credentials without cookie fallback', async () => {
    expect((await request(app).get('/api/v1/cards')).status).toBe(401);
    expect((await request(app).get('/api/v1/cards').set('Authorization', 'Bearer invalid')).status).toBe(401);
    const browser = request.agent(app);
    expect((await browser.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' })).status).toBe(200);
    expect((await browser.get('/api/v1/cards')).status).toBe(401);
  });
  async function browser(username = 'alex', password = 'WorkspaceAdmin123!') {
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ username, password })).status).toBe(200);
    return agent;
  }
  async function issue(scopes = ['content:read', 'content:write'], resources = ['board:b1']) {
    const agent = await browser();
    const created = await agent.post('/api/connections').set('X-Strata-Intent', 'connections').send({ name: 'Test integration', scopes, resources, expiresInDays: 7, confirmation: 'CREATE' });
    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^strata_pat_/);
    return { agent, ...created.body };
  }
  it('issues a one-time secret, scopes reads and writes, and revokes immediately', async () => {
    const credential = await issue();
    const authorization = `Bearer ${credential.token}`;
    const cards = await request(app).get('/api/v1/cards').set('Authorization', authorization);
    expect(cards.status).toBe(200);
    expect(cards.body.items.length).toBeGreaterThan(0);
    expect(cards.body.items.every((card: { boardId: string }) => card.boardId === 'b1')).toBe(true);
    const listId = cards.body.items[0].listId;
    const created = await request(app).post('/api/v1/cards').set('Authorization', authorization).send({ boardId: 'b1', listId, title: 'API card' });
    expect(created.status).toBe(201);
    expect((await request(app).post('/api/v1/cards').set('Authorization', authorization).send({ boardId: 'b2', listId, title: 'Foreign' })).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/users').set('Authorization', authorization)).status).toBe(403);
    const stored = JSON.stringify(db.prepare('SELECT * FROM api_tokens').all());
    expect(stored).not.toContain(credential.token);
    const listed = await credential.agent.get('/api/connections');
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).not.toContain(credential.token);
    expect(listed.body.items[0].lastUsedAt).toBeTruthy();
    expect((await credential.agent.delete(`/api/connections/${credential.connection.id}`).set('X-Strata-Intent', 'connections')).status).toBe(204);
    expect((await request(app).get('/api/v1/cards').set('Authorization', authorization)).status).toBe(401);
  });

});
