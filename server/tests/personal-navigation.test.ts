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
    await agent.post('/api/auth/login').send({ username: 'priya', password: 'Member12345!' });
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
    await member.post('/api/auth/login').send({ username: 'priya', password: 'Member12345!' });
    await member.put('/api/auth/navigation/boards/b1/star').send({ starred: true });
    const list = await member.get('/api/auth/navigation?kind=starred&limit=1').timeout({ response: 2000 });
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([{ boardId: 'b1', workspaceId: 'w1', ...db.prepare('SELECT title, color FROM boards WHERE id = ?').get('b1') as { title: string; color: string }, starred: true, lastVisitedAt: null }]);
    expect(list.body.nextCursor).toBeNull();
    const other = request.agent(app);
    await other.post('/api/auth/login').send({ username: 'marcus', password: 'BoardAdmin123!' });
    expect((await other.get('/api/auth/navigation?kind=starred').timeout({ response: 2000 })).body.items).toEqual([]);
    db.prepare('DELETE FROM board_memberships WHERE user_id = ? AND board_id = ?').run('u3', 'b1');
    expect((await member.get('/api/auth/navigation?kind=starred').timeout({ response: 2000 })).body.items).toEqual([]);
    expect((await member.put('/api/auth/navigation/boards/b1/star').send({ starred: false })).body.code).toBe('DESTINATION_UNAVAILABLE');
  });

});
