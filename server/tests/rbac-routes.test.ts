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

// ─── Board star toggle (requires canManageUserBoard) ─────────────────────

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

  it('denies board member shared-star writes without changing shared state', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'priya', 'Member12345!');
    const before = db.prepare('SELECT starred FROM boards WHERE id = ?').get('b1');
    const res = await agent.patch('/api/boards/b1/star').send();
    expect(res.status).toBe(403);
    expect(db.prepare('SELECT starred FROM boards WHERE id = ?').get('b1')).toEqual(before);
    expect(db.prepare("SELECT outcome FROM audit_events WHERE action = 'board.star_update'").all()).toEqual([{ outcome: 'failure' }]);
  });

  it('denies observer shared-star writes without changing shared state', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'marcus', 'BoardAdmin123!');
    // marcus is observer on b2
    const before = db.prepare('SELECT starred FROM boards WHERE id = ?').get('b2');
    const res = await agent.patch('/api/boards/b2/star').send();
    expect(res.status).toBe(403);
    expect(db.prepare('SELECT starred FROM boards WHERE id = ?').get('b2')).toEqual(before);
    expect(db.prepare("SELECT outcome FROM audit_events WHERE action = 'board.star_update'").all()).toEqual([{ outcome: 'failure' }]);
  });

  it.each([
    { username: 'alex', password: 'WorkspaceAdmin123!' },
    { username: 'marcus', password: 'BoardAdmin123!' },
  ])('allows scoped administrator $username and audits the shared change', async actor => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, actor.username, actor.password);
    const before = db.prepare('SELECT starred FROM boards WHERE id = ?').get('b1') as { starred: number };
    const result = await agent.patch('/api/boards/b1/star').send();
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ starred: !before.starred });
    expect(db.prepare("SELECT outcome FROM audit_events WHERE action = 'board.star_update'").all()).toEqual([{ outcome: 'success' }]);
  });

  it('rolls back the shared toggle if its audit cannot be written', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'marcus', 'BoardAdmin123!');
    const before = db.prepare('SELECT starred FROM boards WHERE id = ?').get('b1');
    db.exec(`CREATE TRIGGER fail_star_audit BEFORE INSERT ON audit_events
      WHEN NEW.action = 'board.star_update'
      BEGIN SELECT RAISE(ABORT, 'Synthetic star audit failure'); END;`);
    const result = await agent.patch('/api/boards/b1/star').send();
    expect(result.status).toBe(500);
    expect(db.prepare('SELECT starred FROM boards WHERE id = ?').get('b1')).toEqual(before);
  });
});

describe('board rename RBAC', () => {
  afterEach(() => { closeDatabase(); });

  it('allows board_admin to rename a board', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'marcus', 'BoardAdmin123!');

    const res = await agent.patch('/api/boards/b1').send({ title: 'Board Admin Rename' });
    expect(res.status).toBe(200);
  });

  it('denies board member from renaming a board', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'priya', 'Member12345!');

    const res = await agent.patch('/api/boards/b1').send({ title: 'Should Fail' });
    expect(res.status).toBe(403);
  });
});

describe('board label management RBAC', () => {
  afterEach(() => { closeDatabase(); });
  const payload = { labels: [{ id: 'lb1', name: 'Managed', color: '#123456' }], expectedRevision: 0 };

  it('allows a board admin to manage shared labels', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'marcus', 'BoardAdmin123!');
    expect((await agent.put('/api/boards/b1/labels').send(payload)).status).toBe(200);
  });

  it('denies a board member and preserves the definitions', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const before = db.prepare('SELECT labels_json as labelsJson FROM boards WHERE id = ?').get('b1') as { labelsJson: string };
    const agent = await login(app, 'priya', 'Member12345!');

    expect((await agent.put('/api/boards/b1/labels').send(payload)).status).toBe(403);
    const after = db.prepare('SELECT labels_json as labelsJson FROM boards WHERE id = ?').get('b1') as { labelsJson: string };
    expect(after.labelsJson).toBe(before.labelsJson);
  });
});

describe('workspace rename RBAC', () => {
  afterEach(() => { closeDatabase(); });

  it('allows workspace_admin to rename a workspace', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'alex', 'WorkspaceAdmin123!');

    const res = await agent.patch('/api/workspaces/w1').send({ name: 'Workspace Admin Rename' });
    expect(res.status).toBe(200);
  });

  it('denies workspace member from renaming a workspace', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await login(app, 'priya', 'Member12345!');

    const res = await agent.patch('/api/workspaces/w1').send({ name: 'Should Fail' });
    expect(res.status).toBe(403);
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

    expect((await agent.post(`/api/lists/${listId}/archive`).send()).status).toBe(200);
    expect((await agent.delete(`/api/lists/${listId}`).send()).status).toBe(200);
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

  it('denies a board member from permanently deleting an archived list', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    db.prepare("UPDATE lists SET archived = 1 WHERE id = 'l1'").run();
    const agent = await login(app, 'priya', 'Member12345!');

    expect((await agent.delete('/api/lists/l1').send()).status).toBe(403);
    expect(db.prepare("SELECT id FROM lists WHERE id = 'l1'").get()).toBeTruthy();
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

  it('allows a board member to create and update cards but not delete them', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    // priya is member on b1
    const agent = await login(app, 'priya', 'Member12345!');
    const res = await agent.post('/api/cards').send({ boardId: 'b1', listId: 'l1', title: 'Member Card' });
    expect(res.status).toBe(201);
    expect((await agent.patch(`/api/cards/${res.body.id}`).send({ title: 'Updated Member Card' })).status).toBe(200);
    expect((await agent.delete(`/api/cards/${res.body.id}`)).status).toBe(403);
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
    conditions: { listId: null, labelId: null },
    action: 'assign_member',
    actionConfig: { memberId: 'u3' },
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
    expect((await agent.post('/api/automation-rules').send({ boardId: 'b1', name: 'X', trigger: 't', triggerConfig: {}, conditions: { listId: null, labelId: null }, action: 'a', actionConfig: {}, enabled: true })).status).toBe(401);
    expect((await agent.post('/api/notifications/read-all').send()).status).toBe(401);
  });
});
