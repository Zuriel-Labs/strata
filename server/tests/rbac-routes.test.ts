// @vitest-environment node
/**
 * RBAC route-level tests — validates every role can perform actions within scope
 * and receives 403 when acting outside scope.
 *
 * Seeded roles:
 *   admin  (u1) — system_admin, ws_admin w1+w2, board_admin b1+b2+b3
 *   alex   (u2) — user, ws_admin w1 only, board_admin b1+b2
 *   priya  (u3) — user, member w1+w2, board member b1+b3
 *   marcus (u4) — user, member w1, board_admin b1, observer b2
 *
 * Resources:
 *   w1 — Acme Engineering      w2 — Marketing
 *   b1 — Platform Sprint 24 (w1)   b2 — Bug Tracker (w1)   b3 — Q1 Campaign (w2)
 *   l1-l5 — board b1               l6-l9 — board b2        l10-l13 — board b3
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase, closeDatabase } from '../src/db/database';
import { createApp } from '../src/app';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
});

function login(app: ReturnType<typeof createApp>, username: string, password: string) {
  const agent = request.agent(app);
  return agent.post('/api/auth/login').send({ username, password }).then(() => agent);
}

// ─── Board creation (requires canManageWorkspace) ────────────────────────

describe('board creation RBAC', () => {
  afterEach(() => { closeDatabase(); });
  const payload = { workspaceId: 'w1', title: 'RBAC Board', color: '#000' };

  it('allows system_admin to create board in any workspace', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'admin', 'ChangeMe123!');
    await agent.post('/api/auth/password/change').send({ currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!', confirmPassword: 'ChangeThisNow123!' });
    const res = await agent.post('/api/boards').send(payload);
    expect(res.status).toBe(201);
  });

  it('allows workspace_admin to create board in their workspace', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'alex', 'WorkspaceAdmin123!');
    const res = await agent.post('/api/boards').send(payload);
    expect(res.status).toBe(201);
  });

  it('denies workspace member from creating board', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'priya', 'Member12345!');
    const res = await agent.post('/api/boards').send(payload);
    expect(res.status).toBe(403);
  });

  it('denies workspace member (marcus) from creating board', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'marcus', 'BoardAdmin123!');
    const res = await agent.post('/api/boards').send(payload);
    expect(res.status).toBe(403);
  });

  it('denies workspace_admin creating board outside their workspace', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    // Alex is ws_admin for w1 only, not w2
    const agent = await login(app, 'alex', 'WorkspaceAdmin123!');
    const res = await agent.post('/api/boards').send({ workspaceId: 'w2', title: 'Out of scope', color: '#000' });
    expect(res.status).toBe(403);
  });
});

// ─── Board star toggle (requires canAccessBoard) ─────────────────────────

describe('board star toggle RBAC', () => {
  afterEach(() => { closeDatabase(); });

  it('allows system_admin', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'admin', 'ChangeMe123!');
    await agent.post('/api/auth/password/change').send({ currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!', confirmPassword: 'ChangeThisNow123!' });
    const res = await agent.patch('/api/boards/b1/star').send();
    expect(res.status).toBe(200);
  });

  it('allows board member to star a board', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'priya', 'Member12345!');
    const res = await agent.patch('/api/boards/b1/star').send();
    expect(res.status).toBe(200);
  });

  it('allows observer to star a board', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'marcus', 'BoardAdmin123!');
    // marcus is observer on b2
    const res = await agent.patch('/api/boards/b2/star').send();
    expect(res.status).toBe(200);
  });
});

// ─── List CRUD (requires canManageBoard) ─────────────────────────────────

describe('list CRUD RBAC', () => {
  afterEach(() => { closeDatabase(); });

  it('allows board_admin to create/update/archive/restore list', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    // marcus is board_admin on b1
    const agent = await login(app, 'marcus', 'BoardAdmin123!');

    const create = await agent.post('/api/lists').send({ boardId: 'b1', title: 'Admin List' });
    expect(create.status).toBe(201);

    const listId = create.body.id;
    expect((await agent.patch(`/api/lists/${listId}`).send({ title: 'Renamed' })).status).toBe(200);
    expect((await agent.post(`/api/lists/${listId}/archive`).send()).status).toBe(200);
    expect((await agent.post(`/api/lists/${listId}/restore`).send()).status).toBe(200);
  });

  it('allows workspace_admin to manage lists in boards of their workspace', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    // alex is ws_admin for w1 which owns b1
    const agent = await login(app, 'alex', 'WorkspaceAdmin123!');

    const create = await agent.post('/api/lists').send({ boardId: 'b1', title: 'WS Admin List' });
    expect(create.status).toBe(201);

    const listId = create.body.id;
    expect((await agent.patch(`/api/lists/${listId}`).send({ title: 'Renamed' })).status).toBe(200);
  });

  it('denies board member from creating lists', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    // priya is board member on b1, not board_admin
    const agent = await login(app, 'priya', 'Member12345!');
    const res = await agent.post('/api/lists').send({ boardId: 'b1', title: 'Denied List' });
    expect(res.status).toBe(403);
  });

  it('denies observer from creating lists', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    // marcus is observer on b2
    const agent = await login(app, 'marcus', 'BoardAdmin123!');
    const res = await agent.post('/api/lists').send({ boardId: 'b2', title: 'Observer List' });
    expect(res.status).toBe(403);
  });

  it('denies user with no board access', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    // priya has no membership on b2
    const agent = await login(app, 'priya', 'Member12345!');
    const res = await agent.post('/api/lists').send({ boardId: 'b2', title: 'No Access' });
    expect(res.status).toBe(403);
  });
});

// ─── Card CRUD (requires canManageBoard for create/update/delete) ────────

describe('card CRUD RBAC', () => {
  afterEach(() => { closeDatabase(); });

  it('allows board_admin to create/update/delete cards', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'marcus', 'BoardAdmin123!');

    // Create card on b1/l1 (marcus is board_admin for b1)
    const create = await agent.post('/api/cards').send({ boardId: 'b1', listId: 'l1', title: 'Admin Card' });
    expect(create.status).toBe(201);
    const cardId = create.body.id;

    // Update
    const update = await agent.patch(`/api/cards/${cardId}`).send({ description: 'Updated by admin' });
    expect(update.status).toBe(200);

    // Delete
    const del = await agent.delete(`/api/cards/${cardId}`).send();
    expect(del.status).toBe(204);
  });

  it('allows workspace_admin to CRUD cards in their workspace boards', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'alex', 'WorkspaceAdmin123!');

    const create = await agent.post('/api/cards').send({ boardId: 'b1', listId: 'l1', title: 'WS Admin Card' });
    expect(create.status).toBe(201);

    const update = await agent.patch(`/api/cards/${create.body.id}`).send({ title: 'Renamed' });
    expect(update.status).toBe(200);
  });

  it('denies board member from creating cards', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    // priya is member on b1
    const agent = await login(app, 'priya', 'Member12345!');
    const res = await agent.post('/api/cards').send({ boardId: 'b1', listId: 'l1', title: 'Denied Card' });
    expect(res.status).toBe(403);
  });

  it('denies observer from creating cards', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    // marcus is observer on b2
    const agent = await login(app, 'marcus', 'BoardAdmin123!');
    const res = await agent.post('/api/cards').send({ boardId: 'b2', listId: 'l6', title: 'Observer Card' });
    expect(res.status).toBe(403);
  });

  it('denies observer from updating cards on observed board', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    // First create a card as admin
    const adminAgent = await login(app, 'admin', 'ChangeMe123!');
    await adminAgent.post('/api/auth/password/change').send({ currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!', confirmPassword: 'ChangeThisNow123!' });
    const card = await adminAgent.post('/api/cards').send({ boardId: 'b2', listId: 'l6', title: 'Observed Card' });

    // marcus is observer on b2, should not be able to update
    const marcusAgent = await login(app, 'marcus', 'BoardAdmin123!');
    const res = await marcusAgent.patch(`/api/cards/${card.body.id}`).send({ title: 'Should Fail' });
    expect(res.status).toBe(403);
  });
});

// ─── Automation rules (requires canManageBoard) ──────────────────────────

describe('automation rule RBAC', () => {
  afterEach(() => { closeDatabase(); });

  const rulePayload = {
    boardId: 'b1',
    name: 'Test Rule',
    trigger: 'card_moved',
    triggerConfig: { toListId: 'l5' },
    action: 'assign_member',
    actionConfig: { memberId: 'u1' },
    enabled: true,
  };

  it('allows board_admin to CRUD automation rules', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'marcus', 'BoardAdmin123!');

    const create = await agent.post('/api/automation-rules').send(rulePayload);
    expect(create.status).toBe(201);

    const update = await agent.patch(`/api/automation-rules/${create.body.id}`).send({ enabled: false });
    expect(update.status).toBe(200);

    const del = await agent.delete(`/api/automation-rules/${create.body.id}`).send();
    expect(del.status).toBe(204);
  });

  it('denies board member from creating automation rules', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'priya', 'Member12345!');
    const res = await agent.post('/api/automation-rules').send(rulePayload);
    expect(res.status).toBe(403);
  });

  it('denies observer from creating automation rules', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'marcus', 'BoardAdmin123!');
    // marcus is observer on b2
    const res = await agent.post('/api/automation-rules').send({ ...rulePayload, boardId: 'b2' });
    expect(res.status).toBe(403);
  });
});

// ─── Cross-workspace scope boundary ─────────────────────────────────────

describe('cross-workspace scope isolation', () => {
  afterEach(() => { closeDatabase(); });

  it('alex cannot create boards in w2 (not a member)', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'alex', 'WorkspaceAdmin123!');
    const res = await agent.post('/api/boards').send({ workspaceId: 'w2', title: 'Cross-WS Board', color: '#000' });
    expect(res.status).toBe(403);
  });

  it('alex cannot create lists on b3 (w2 board)', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'alex', 'WorkspaceAdmin123!');
    const res = await agent.post('/api/lists').send({ boardId: 'b3', title: 'Cross-WS List' });
    expect(res.status).toBe(403);
  });

  it('alex cannot create cards on b3 (w2 board)', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'alex', 'WorkspaceAdmin123!');
    const res = await agent.post('/api/cards').send({ boardId: 'b3', listId: 'l10', title: 'Cross-WS Card' });
    expect(res.status).toBe(403);
  });

  it('priya (member of w2) cannot manage b3 lists (member, not admin)', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'priya', 'Member12345!');
    const res = await agent.post('/api/lists').send({ boardId: 'b3', title: 'Member List' });
    expect(res.status).toBe(403);
  });
});

// ─── Unauthenticated access ─────────────────────────────────────────────

describe('unauthenticated access', () => {
  afterEach(() => { closeDatabase(); });

  it('rejects all CRUD routes when not logged in', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = request.agent(app);

    expect((await agent.post('/api/boards').send({ workspaceId: 'w1', title: 'X', color: '#000' })).status).toBe(401);
    expect((await agent.post('/api/lists').send({ boardId: 'b1', title: 'X' })).status).toBe(401);
    expect((await agent.post('/api/cards').send({ boardId: 'b1', listId: 'l1', title: 'X' })).status).toBe(401);
    expect((await agent.post('/api/automation-rules').send({ boardId: 'b1', name: 'X', trigger: 't', triggerConfig: {}, action: 'a', actionConfig: {}, enabled: true })).status).toBe(401);
    expect((await agent.post('/api/notifications/read-all').send()).status).toBe(401);
  });
});
