// @vitest-environment node
import { afterEach, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase, closeDatabase } from '../src/db/database';
import { createApp } from '../src/app';

beforeAll(() => { process.env.SEED_DATA = 'true'; });
afterEach(() => { closeDatabase(); });
async function setup() {
  const db = await createDatabase(':memory:');
  const app = createApp(db);
  const admin = request.agent(app);
  await admin.post('/api/auth/login').send({ username: 'admin', password: 'ChangeMe123!' });
  await admin.post('/api/auth/password/change').send({ currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!', confirmPassword: 'ChangeThisNow123!' });
  const member = request.agent(app);
  await member.post('/api/auth/login').send({ username: 'priya', password: 'Member12345!' });
  return { db, admin, member };
}

it('filters collection membership without granting access or disclosing hidden boards', async () => {
  const { admin, member } = await setup();
  const created = await admin.post('/api/workspaces/w1/collections').send({ name: 'Launch' });
  expect(created.status).toBe(201);
  const id = created.body.id;
  expect((await admin.put(`/api/collections/${id}/boards/b1`).send({})).status).toBe(204);
  expect((await admin.put(`/api/collections/${id}/boards/b2`).send({})).status).toBe(204);
  expect((await admin.put(`/api/collections/${id}/boards/b3`).send({})).status).toBe(400);
  const own = await member.get('/api/workspaces/w1/collections');
  expect(own.status).toBe(200);
  expect(own.body.items).toHaveLength(1);
  expect(own.body.items[0].boardIds).toEqual(['b1']);
  expect((await member.post('/api/workspaces/w1/collections').send({ name: 'Denied' })).status).toBe(403);
  expect((await member.get('/api/workspaces/bootstrap')).body.appState.boards.some((board: { id: string }) => board.id === 'b2')).toBe(false);
  const current = (await admin.get('/api/workspaces/w1/collections')).body.items[0];
  expect((await admin.patch(`/api/collections/${id}`).send({ name: 'Renamed', expectedRevision: current.revision })).status).toBe(200);
  expect((await admin.delete(`/api/collections/${id}`).send({ expectedRevision: current.revision })).status).toBe(409);
});

it('stores personal collapse independently and reserves shared list color for administrators', async () => {
  const { db, admin, member } = await setup();
  expect((await member.put('/api/auth/list-preferences/l1').send({ collapsed: true })).status).toBe(200);
  expect((await member.put('/api/auth/list-preferences/l1').send({ collapsed: false, userId: 'u1' })).status).toBe(400);
  expect((await member.patch('/api/lists/l1/presentation').send({ color: '#6366f1', expectedRevision: 0 })).status).toBe(403);
  expect((await admin.patch('/api/lists/l1/presentation').send({ color: '#6366f1', expectedRevision: 0 })).status).toBe(200);
  expect((await admin.patch('/api/lists/l1/presentation').send({ color: '#abcdef', expectedRevision: 1 })).status).toBe(400);
  const own = (await member.get('/api/workspaces/bootstrap')).body.appState.lists.find((list: { id: string }) => list.id === 'l1');
  const other = (await admin.get('/api/workspaces/bootstrap')).body.appState.lists.find((list: { id: string }) => list.id === 'l1');
  expect(own).toMatchObject({ collapsed: true, color: '#6366f1' });
  expect(other).toMatchObject({ collapsed: false, color: '#6366f1' });
  expect(db.prepare('SELECT revision FROM lists WHERE id = ?').pluck().get('l1')).toBe(1);
});

it('bounds collection pages after access filtering and rejects a foreign cursor', async () => {
  const { db, admin, member } = await setup();
  for (const [id, boardId] of [['a-hidden', 'b2'], ['b-visible', 'b1'], ['c-visible', 'b1']]) {
    db.prepare('INSERT INTO board_collections (id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)').run(id, 'w1', id, new Date().toISOString());
    db.prepare('INSERT INTO board_collection_items VALUES (?, ?)').run(id, boardId);
  }
  const first = await member.get('/api/workspaces/w1/collections?limit=1');
  expect(first.body.items.map((item: { id: string }) => item.id)).toEqual(['b-visible']);
  expect(first.body.nextCursor).toEqual(expect.any(String));
  const second = await member.get('/api/workspaces/w1/collections').query({ limit: 1, cursor: first.body.nextCursor });
  expect(second.body.items.map((item: { id: string }) => item.id)).toEqual(['c-visible']);
  expect(second.body.nextCursor).toBeNull();
  expect((await admin.get('/api/workspaces/w1/collections').query({ cursor: first.body.nextCursor })).status).toBe(400);
  expect((await member.get('/api/workspaces/w1/collections?limit=101')).status).toBe(400);
});
