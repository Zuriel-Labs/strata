// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from '../src/db/database';
import request from 'supertest';
import { createApp } from '../src/app';
import { createSchema } from '../src/db/schema';

describe('personal navigation', () => {
  let db: DatabaseHandle;
  beforeEach(async () => { process.env.SEED_DATA = 'true'; db = await createDatabase(':memory:'); });
  afterEach(() => db.close());

  it('migrates twice without copying shared stars or changing existing records', () => {
    // Finish the existing legacy card-membership migration before modeling a prior database.
    createSchema(db);
    db.exec('DROP TABLE user_board_navigation');
    const tables = ['users', 'boards', 'board_memberships', 'workspace_admin_grants', 'board_admin_grants', 'cards', 'audit_events'];
    const before = tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    createSchema(db);
    createSchema(db);
    expect(db.prepare('SELECT * FROM user_board_navigation').all()).toEqual([]);
    expect(tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())).toEqual(before);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  it('lets a member set only their personal star without changing shared stars', async () => {
    const agent = request.agent(createApp(db));
    expect((await agent.post('/api/auth/login').send({ username: 'priya', password: 'Member12345!' })).status).toBe(200);
    const shared = db.prepare('SELECT starred FROM boards WHERE id = ?').get('b1');
    const result = await agent.put('/api/auth/navigation/boards/b1/star').send({ starred: true });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ boardId: 'b1', starred: true });
    expect(db.prepare('SELECT user_id, board_id, starred FROM user_board_navigation').all()).toEqual([{ user_id: 'u3', board_id: 'b1', starred: 1 }]);
    expect(db.prepare('SELECT starred FROM boards WHERE id = ?').get('b1')).toEqual(shared);
  });

  it('lists only the actor’s accessible stars and filters revocation immediately', async () => {
    const app = createApp(db);
    const member = request.agent(app);
    expect((await member.post('/api/auth/login').send({ username: 'priya', password: 'Member12345!' })).status).toBe(200);
    await member.put('/api/auth/navigation/boards/b1/star').send({ starred: true });
    const list = await member.get('/api/auth/navigation?kind=starred&limit=1').timeout({ response: 2000 });
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([{ boardId: 'b1', workspaceId: 'w1', ...db.prepare('SELECT title, color FROM boards WHERE id = ?').get('b1') as { title: string; color: string }, starred: true, lastVisitedAt: null }]);
    expect(list.body.nextCursor).toBeNull();
    const other = request.agent(app);
    expect((await other.post('/api/auth/login').send({ username: 'marcus', password: 'BoardAdmin123!' })).status).toBe(200);
    expect((await other.get('/api/auth/navigation?kind=starred').timeout({ response: 2000 })).body.items).toEqual([]);
    db.prepare('DELETE FROM board_memberships WHERE user_id = ? AND board_id = ?').run('u3', 'b1');
    expect((await member.get('/api/auth/navigation?kind=starred').timeout({ response: 2000 })).body.items).toEqual([]);
    expect((await member.put('/api/auth/navigation/boards/b1/star').send({ starred: false })).body.code).toBe('DESTINATION_UNAVAILABLE');
  });

  it('records authorized visits once and rejects stale or forged destinations without writes', async () => {
    const app = createApp(db);
    const member = request.agent(app);
    expect((await member.post('/api/auth/login').send({ username: 'priya', password: 'Member12345!' })).status).toBe(200);
    for (let n = 0; n < 2; n++) expect((await member.put('/api/auth/navigation/boards/b1/visit').send({})).status).toBe(204);
    const recent = await member.get('/api/auth/navigation?kind=recent');
    expect(recent.body.items).toHaveLength(1);
    expect(recent.body.items[0]).toMatchObject({ boardId: 'b1', starred: false, lastVisitedAt: expect.any(String) });
    const before = db.prepare('SELECT * FROM user_board_navigation').all();
    for (const id of ['missing', 'b2']) {
      const rejected = await member.put(`/api/auth/navigation/boards/${id}/visit`).send({});
      expect(rejected.status).toBe(404);
      expect(rejected.body).toEqual({ code: 'DESTINATION_UNAVAILABLE', message: 'Destination unavailable.' });
    }
    expect((await member.put('/api/auth/navigation/boards/b1/visit').send({ userId: 'u4' })).status).toBe(400);
    expect(db.prepare('SELECT * FROM user_board_navigation').all()).toEqual(before);
    expect((await request(app).get('/api/auth/navigation?kind=recent')).status).toBe(401);
  });

  it('uses stable bounded pages with actor- and kind-bound cursors', async () => {
    const agent = request.agent(createApp(db));
    expect((await agent.post('/api/auth/login').send({ username: 'priya', password: 'Member12345!' })).status).toBe(200);
    for (const id of ['b1', 'b3']) await agent.put(`/api/auth/navigation/boards/${id}/star`).send({ starred: true });
    db.prepare('UPDATE user_board_navigation SET starred_at = ?').run('2026-10-01T00:00:00.000Z');
    const first = await agent.get('/api/auth/navigation?kind=starred&limit=1');
    expect(first.body.items.map((item: { boardId: string }) => item.boardId)).toEqual(['b1']);
    const cursor = first.body.nextCursor;
    expect(typeof cursor).toBe('string');
    const second = await agent.get('/api/auth/navigation').query({ kind: 'starred', limit: 1, cursor });
    expect(second.body.items.map((item: { boardId: string }) => item.boardId)).toEqual(['b3']);
    expect(second.body.nextCursor).toBeNull();
    for (const query of [{ kind: 'recent', cursor }, { kind: 'starred', cursor: 'bad' }, { kind: 'starred', limit: 51 }, { kind: 'starred', limit: 0 }, { kind: 'starred', userId: 'u4' }]) {
      expect((await agent.get('/api/auth/navigation').query(query)).body.code).toBe('NAVIGATION_INVALID');
    }
    const other = request.agent(createApp(db));
    expect((await other.post('/api/auth/login').send({ username: 'marcus', password: 'BoardAdmin123!' })).status).toBe(200);
    expect((await other.get('/api/auth/navigation').query({ kind: 'starred', cursor })).status).toBe(400);
  });

  it('retains only 50 recent references while preserving older stars', async () => {
    const agent = request.agent(createApp(db));
    expect((await agent.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' })).status).toBe(200);
    const insert = db.prepare("INSERT INTO boards (id, title, workspace_id, visibility, color, labels_json, created_at) VALUES (?, 'Synthetic board', 'w1', 'public', '#123456', '[]', ?)");
    for (let n = 0; n < 52; n++) {
      const id = `history-${String(n).padStart(3, '0')}`;
      insert.run(id, '2026-10-01T00:00:00.000Z');
      if (n === 0) await agent.put(`/api/auth/navigation/boards/${id}/star`).send({ starred: true });
      expect((await agent.put(`/api/auth/navigation/boards/${id}/visit`).send({})).status, `visit ${n}`).toBe(204);
      db.prepare('UPDATE user_board_navigation SET last_visited_at = ? WHERE board_id = ?').run(`2026-10-01T00:00:${String(n).padStart(2, '0')}.000Z`, id);
    }
    expect(db.prepare('SELECT COUNT(*) AS count FROM user_board_navigation WHERE user_id = ? AND last_visited_at IS NOT NULL').get('u2')).toEqual({ count: 50 });
    expect((await agent.get('/api/auth/navigation?kind=starred')).body.items[0]).toMatchObject({ boardId: 'history-000', starred: true, lastVisitedAt: null });
    expect((await agent.get('/api/auth/navigation?kind=recent&limit=50')).body.items).toHaveLength(50);
  });

  it('keeps personal star retries idempotent and rolls back on audit failure', async () => {
    const agent = request.agent(createApp(db));
    expect((await agent.post('/api/auth/login').send({ username: 'marcus', password: 'BoardAdmin123!' })).status).toBe(200);
    for (let n = 0; n < 2; n++) expect((await agent.put('/api/auth/navigation/boards/b2/star').send({ starred: true })).status).toBe(200);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'auth.navigation_star'").all()).toHaveLength(1);
    db.exec("CREATE TRIGGER fail_navigation_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'auth.navigation_star' BEGIN SELECT RAISE(ABORT, 'Synthetic navigation failure'); END;");
    expect((await agent.put('/api/auth/navigation/boards/b2/star').send({ starred: false })).status).toBe(500);
    expect((await agent.get('/api/auth/navigation?kind=starred')).body.items[0].starred).toBe(true);
    for (const body of [{ starred: 'true' }, { starred: true, userId: 'u3' }]) expect((await agent.put('/api/auth/navigation/boards/b2/star').send(body)).status).toBe(400);
  });

});
