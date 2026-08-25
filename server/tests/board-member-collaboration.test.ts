// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { closeDatabase, createDatabase } from '../src/db/database';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
});

function login(app: ReturnType<typeof createApp>, username: string, password: string) {
  const agent = request.agent(app);
  return agent.post('/api/auth/login').send({ username, password }).then(() => agent);
}

describe('Board Member card collaboration', () => {
  afterEach(() => closeDatabase());

  it('allows an exact Member to create, edit, move, and duplicate cards on their Board', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const member = await login(app, 'priya', 'Member12345!');

    const created = await member.post('/api/cards').send({ boardId: 'b1', listId: 'l1', title: 'Member card' });
    expect(created.status).toBe(201);

    const updates = {
      title: 'Member-maintained card',
      description: 'Member description',
      memberIds: ['u3'],
      labelIds: ['lb1'],
      checklists: [{ id: 'cl-member', title: 'Member checklist', items: [{ id: 'ci-member', text: 'Verify', completed: true }] }],
      dueDate: '2026-09-01',
      dueDateComplete: true,
      attachments: [{ id: 'at-member', name: 'Context', kind: 'link', url: 'https://example.com', createdAt: '2026-08-25T00:00:00.000Z' }],
      watching: true,
    };
    const updated = await member.patch(`/api/cards/${created.body.id}`).send(updates);
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject(updates);

    const moved = await member.post(`/api/cards/${created.body.id}/move`).send({ toListId: 'l2', toPosition: 0 });
    expect(moved.status).toBe(200);
    expect(moved.body.listId).toBe('l2');

    const duplicate = await member.post(`/api/cards/${created.body.id}/duplicate`).send({});
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.title).toBe('Member-maintained card (copy)');
  });

  it('keeps list structure, bulk sorting, card archive, and card deletion administrative', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const member = await login(app, 'priya', 'Member12345!');

    expect((await member.post('/api/lists').send({ boardId: 'b1', title: 'Denied' })).status).toBe(403);
    expect((await member.patch('/api/lists/l1').send({ title: 'Denied' })).status).toBe(403);
    expect((await member.post('/api/lists/l1/move').send({ toPosition: 1 })).status).toBe(403);
    expect((await member.post('/api/lists/l1/sort').send({ direction: 'asc' })).status).toBe(403);
    expect((await member.post('/api/lists/l1/archive').send()).status).toBe(403);
    expect((await member.patch('/api/cards/c5').send({ archived: true })).status).toBe(403);
    expect((await member.delete('/api/cards/c5').send()).status).toBe(403);
    expect((await member.patch('/api/cards/c5').send({ listId: 'l2', position: 0 })).status).toBe(400);
  });

  it('rejects Observer, out-of-scope, and non-Member card mutations', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const observer = await login(app, 'marcus', 'BoardAdmin123!');
    const member = await login(app, 'priya', 'Member12345!');

    expect((await observer.post('/api/cards').send({ boardId: 'b2', listId: 'l6', title: 'Denied observer card' })).status).toBe(403);
    expect((await observer.patch('/api/cards/c10').send({ title: 'Denied observer edit' })).status).toBe(403);
    expect((await member.post('/api/cards').send({ boardId: 'b2', listId: 'l6', title: 'Denied out-of-scope card' })).status).toBe(403);
    expect((await member.post('/api/cards').send({ boardId: 'b1', listId: 'l10', title: 'Denied cross-board list' })).status).toBe(400);
  });

  it('assigns only active Member-role accounts on the same Board', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const member = await login(app, 'priya', 'Member12345!');
    const now = new Date().toISOString();
    db.prepare('INSERT INTO board_memberships (id, user_id, board_id, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), 'u4', 'b1', 'observer', now);

    expect((await member.patch('/api/cards/c5').send({ memberIds: ['u3'] })).status).toBe(200);
    const observerAssignment = await member.patch('/api/cards/c5').send({ memberIds: ['u4'] });
    expect(observerAssignment.status).toBe(400);
    expect(observerAssignment.body.message).toBe('One or more selected people are not active members of this board.');

    db.prepare("UPDATE board_memberships SET role = 'member' WHERE user_id = 'u4' AND board_id = 'b1'").run();
    db.prepare("UPDATE users SET active = 0 WHERE id = 'u4'").run();
    expect((await member.patch('/api/cards/c5').send({ memberIds: ['u4'] })).status).toBe(400);
    expect((await member.patch('/api/cards/c5').send({ memberIds: ['u3', 'u3'] })).status).toBe(400);
  });
});

describe('automation editing authority', () => {
  afterEach(() => closeDatabase());

  it('allows Board Admin, Workspace Admin, and System Admin to edit rules in scope', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const boardAdmin = await login(app, 'marcus', 'BoardAdmin123!');
    const workspaceAdmin = await login(app, 'alex', 'WorkspaceAdmin123!');
    const systemAdmin = await login(app, 'admin', 'ChangeMe123!');

    const boardEdit = await boardAdmin.patch('/api/automation-rules/ar2').send({ name: 'Board Admin edit' });
    expect(boardEdit.status).toBe(200);
    expect(boardEdit.body.name).toBe('Board Admin edit');

    const workspaceEdit = await workspaceAdmin.patch('/api/automation-rules/ar2').send({ name: 'Workspace Admin edit' });
    expect(workspaceEdit.status).toBe(200);
    expect(workspaceEdit.body.name).toBe('Workspace Admin edit');

    const systemEdit = await systemAdmin.patch('/api/automation-rules/ar2').send({ name: 'System Admin edit' });
    expect(systemEdit.status).toBe(200);
    expect(systemEdit.body.name).toBe('System Admin edit');
    expect(db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'automation.update' AND scope_id = 'b1'").get())
      .toEqual({ count: 3 });
  });

  it('denies Members and out-of-scope admins without mutating the rule', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const member = await login(app, 'priya', 'Member12345!');
    const outOfScopeBoardAdmin = await login(app, 'marcus', 'BoardAdmin123!');

    expect((await member.patch('/api/automation-rules/ar2').send({ name: 'Denied Member edit' })).status).toBe(403);
    db.prepare("UPDATE automation_rules SET board_id = 'b3' WHERE id = 'ar2'").run();
    expect((await outOfScopeBoardAdmin.patch('/api/automation-rules/ar2').send({ name: 'Denied scoped edit' })).status).toBe(403);
    expect((db.prepare("SELECT name FROM automation_rules WHERE id = 'ar2'").get() as { name: string }).name).not.toContain('Denied');
  });
});

describe('comment ownership and moderation', () => {
  afterEach(() => closeDatabase());

  it('derives comment authorship, lets the author edit, and blocks generic history replacement', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const member = await login(app, 'priya', 'Member12345!');

    const created = await member.post('/api/cards/c5/comments').send({ text: '  Member context  ' });
    expect(created.status).toBe(201);
    const comment = created.body.comments.at(-1);
    expect(comment).toMatchObject({ userId: 'u3', text: 'Member context' });
    expect(comment.id).toBeTruthy();
    expect(comment.createdAt).toBeTruthy();

    const edited = await member.patch(`/api/cards/c5/comments/${comment.id}`).send({ text: 'Updated member context' });
    expect(edited.status).toBe(200);
    expect(edited.body.comments.find((entry: { id: string }) => entry.id === comment.id)).toEqual({
      ...comment,
      text: 'Updated member context',
    });

    expect((await member.patch('/api/cards/c5').send({ comments: [] })).status).toBe(400);
    expect((await member.patch('/api/cards/c5').send({ activity: [] })).status).toBe(400);
    expect((await member.post('/api/cards/c5/comments').send({ text: 'Spoofed', userId: 'u1' })).status).toBe(400);
  });

  it('rejects empty comments, Observer comments, cross-author edits, and Member deletion', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const member = await login(app, 'priya', 'Member12345!');
    const observer = await login(app, 'marcus', 'BoardAdmin123!');
    const created = await member.post('/api/cards/c5/comments').send({ text: 'Owned by Priya' });
    const commentId = created.body.comments.at(-1).id as string;

    expect((await member.post('/api/cards/c5/comments').send({ text: '   ' })).status).toBe(400);
    expect((await observer.post('/api/cards/c10/comments').send({ text: 'Observer denied' })).status).toBe(403);
    expect((await observer.patch(`/api/cards/c5/comments/${commentId}`).send({ text: 'Admin cannot rewrite another author' })).status).toBe(403);
    expect((await member.patch('/api/cards/c5/comments/missing').send({ text: 'Missing' })).status).toBe(404);
    expect((await member.delete(`/api/cards/c5/comments/${commentId}`).send()).status).toBe(403);
    expect((await member.get('/api/auth/session')).body.appState.cards.find((card: { id: string }) => card.id === 'c5').comments).toContainEqual(expect.objectContaining({ id: commentId, text: 'Owned by Priya' }));
  });

  it('lets Board Admin and higher delete in-scope comments and audits the committed deletion', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const member = await login(app, 'priya', 'Member12345!');
    const boardAdmin = await login(app, 'marcus', 'BoardAdmin123!');
    const created = await member.post('/api/cards/c5/comments').send({ text: 'Moderate me' });
    const commentId = created.body.comments.at(-1).id as string;

    const deleted = await boardAdmin.delete(`/api/cards/c5/comments/${commentId}`).send();
    expect(deleted.status).toBe(200);
    expect(deleted.body.comments.some((comment: { id: string }) => comment.id === commentId)).toBe(false);
    expect(db.prepare("SELECT actor_user_id AS actorUserId, scope_id AS scopeId, outcome FROM audit_events WHERE action = 'card.comment.delete' AND json_extract(metadata_json, '$.commentId') = ?").get(commentId))
      .toEqual({ actorUserId: 'u4', scopeId: 'b1', outcome: 'success' });
    expect((await boardAdmin.delete(`/api/cards/c5/comments/${commentId}`).send()).status).toBe(404);
  });

  it('enforces Board scope for higher-level comment moderation', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const member = await login(app, 'priya', 'Member12345!');
    const workspaceAdmin = await login(app, 'alex', 'WorkspaceAdmin123!');
    const created = await member.post('/api/cards/c11/comments').send({ text: 'Marketing context' });
    const commentId = created.body.comments.at(-1).id as string;

    expect((await workspaceAdmin.delete(`/api/cards/c11/comments/${commentId}`).send()).status).toBe(403);
    expect((await member.get('/api/auth/session')).body.appState.cards.find((card: { id: string }) => card.id === 'c11').comments)
      .toContainEqual(expect.objectContaining({ id: commentId }));
  });
});
