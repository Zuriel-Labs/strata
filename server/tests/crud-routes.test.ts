// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase, closeDatabase } from '../src/db/database';
import { createApp } from '../src/app';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
});

/** Log in as the seeded admin user (pre-rotated password) */
async function loginAdmin(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'ChangeMe123!' });
  await agent.post('/api/auth/password/change').send({ currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!', confirmPassword: 'ChangeThisNow123!' });
  return agent;
}

/** Log in as a non-admin seeded user */
async function loginAs(app: ReturnType<typeof createApp>, username: string, password: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username, password });
  return agent;
}

describe('board CRUD routes', () => {
  afterEach(() => { closeDatabase(); });

  it('creates a board with default labels', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const res = await agent.post('/api/boards').send({ workspaceId: 'w1', title: 'New Board', color: '#3b82f6' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('New Board');
    expect(res.body.workspaceId).toBe('w1');
    expect(res.body.color).toBe('#3b82f6');
    expect(res.body.labels).toHaveLength(3);
    expect(res.body.id).toBeTruthy();
  });

  it('creates a board with custom labels', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const labels = [{ id: 'lb1', name: 'Priority', color: '#ff0000' }];
    const res = await agent.post('/api/boards').send({ workspaceId: 'w1', title: 'Custom Board', color: '#10b981', labels });
    expect(res.status).toBe(201);
    expect(res.body.labels).toEqual(labels);
  });

  it('rejects board creation with invalid payload', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const res = await agent.post('/api/boards').send({ title: 'No workspace' });
    expect(res.status).toBe(400);
  });

  it('toggles board star', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    // b1 is seeded with starred=true, so first toggle sets it to false
    const res1 = await agent.patch('/api/boards/b1/star').send();
    expect(res1.status).toBe(200);
    expect(res1.body.starred).toBe(false);

    // Toggle again to true
    const res2 = await agent.patch('/api/boards/b1/star').send();
    expect(res2.status).toBe(200);
    expect(res2.body.starred).toBe(true);
  });

  it('renames a board', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const res = await agent.patch('/api/boards/b1').send({ title: 'Platform Launch' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Platform Launch');
    const row = db.prepare('SELECT title FROM boards WHERE id = ?').get('b1') as { title: string };
    expect(row.title).toBe('Platform Launch');
  });

  it('rejects renaming a board with a blank title', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const res = await agent.patch('/api/boards/b1').send({ title: '   ' });

    expect(res.status).toBe(400);
  });

  it('returns 403 when creating board in inaccessible workspace', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    // priya (u3) is a member of w1 but not workspace_admin
    const agent = await loginAs(app, 'priya', 'Member12345!');

    const res = await agent.post('/api/boards').send({ workspaceId: 'w1', title: 'Denied Board', color: '#000' });
    expect(res.status).toBe(403);
  });

  it('updates board labels and cleans up removed label references', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    await agent.patch('/api/cards/c5').send({ labelIds: ['lb3'] });
    const rule = await agent.post('/api/automation-rules').send({
      boardId: 'b1',
      name: 'Add bug label',
      trigger: 'card_created',
      triggerConfig: {},
      conditions: { listId: null, labelId: 'lb3' },
      action: 'add_label',
      actionConfig: { labelId: 'lb3' },
      enabled: true,
    });
    expect(rule.status).toBe(201);

    const res = await agent.put('/api/boards/b1/labels').send({
      labels: [
        { id: 'lb1', name: 'Urgent', color: '#ef4444' },
        { id: 'lb2', name: 'Feature', color: '#a855f7' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.labels).toHaveLength(2);

    const cardRow = db.prepare('SELECT label_ids_json as labelIdsJson FROM cards WHERE id = ?').get('c5') as { labelIdsJson: string };
    const ruleRow = db.prepare('SELECT conditions_json as conditionsJson, action_config_json as actionConfigJson, enabled FROM automation_rules WHERE id = ?').get(rule.body.id) as { conditionsJson: string; actionConfigJson: string; enabled: number };
    expect(JSON.parse(cardRow.labelIdsJson)).toEqual([]);
    expect(JSON.parse(ruleRow.conditionsJson)).toEqual({ listId: null, labelId: null });
    expect(JSON.parse(ruleRow.actionConfigJson)).toEqual({});
    expect(ruleRow.enabled).toBe(0);
  });

  it('allows board labels with empty names for color-only labels', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const res = await agent.put('/api/boards/b1/labels').send({
      labels: [
        { id: 'lb1', name: '', color: '#ef4444' },
        { id: 'lb2', name: 'Feature', color: '#a855f7' },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.labels[0]).toEqual({ id: 'lb1', name: '', color: '#ef4444' });
  });

  it('trims label names and rejects invalid colors, duplicate IDs, and unknown fields', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const valid = await agent.put('/api/boards/b1/labels').send({
      labels: [{ id: 'lb1', name: '  Critical  ', color: '#AABBCC' }],
    });
    expect(valid.status).toBe(200);
    expect(valid.body.labels).toEqual([{ id: 'lb1', name: 'Critical', color: '#aabbcc' }]);

    for (const labels of [
      [{ id: 'lb1', name: 'Bad', color: 'red' }],
      [{ id: 'lb1', name: 'One', color: '#112233' }, { id: 'lb1', name: 'Two', color: '#445566' }],
      [{ id: 'lb1', name: 'Bad', color: '#112233', extra: true }],
    ]) {
      const response = await agent.put('/api/boards/b1/labels').send({ labels });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Invalid label payload.' });
    }
  });

  it('rolls back board and dependent label changes when cleanup fails', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);
    const before = db.prepare('SELECT labels_json as labelsJson FROM boards WHERE id = ?').get('b1') as { labelsJson: string };

    db.exec(`
      CREATE TRIGGER fail_label_cleanup BEFORE UPDATE OF label_ids_json ON cards
      WHEN OLD.board_id = 'b1'
      BEGIN SELECT RAISE(ABORT, 'injected cleanup failure'); END;
    `);

    const response = await agent.put('/api/boards/b1/labels').send({
      labels: [{ id: 'lb1', name: 'Urgent', color: '#ef4444' }],
    });

    expect(response.status).toBe(500);
    const after = db.prepare('SELECT labels_json as labelsJson FROM boards WHERE id = ?').get('b1') as { labelsJson: string };
    expect(after.labelsJson).toBe(before.labelsJson);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'board.labels.update'").all()).toEqual([]);
  });

  it('records one successful board-label audit event with actor and scope metadata', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const response = await agent.put('/api/boards/b1/labels').send({
      labels: [{ id: 'lb1', name: 'Urgent', color: '#ef4444' }],
    });
    expect(response.status).toBe(200);

    const events = db.prepare("SELECT actor_user_id as actorUserId, scope_id as scopeId, outcome FROM audit_events WHERE action = 'board.labels.update'").all();
    expect(events).toEqual([{ actorUserId: 'u1', scopeId: 'b1', outcome: 'success' }]);
  });

  it('deletes a board and cascades its content', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const board = await agent.post('/api/boards').send({ workspaceId: 'w1', title: 'Disposable Board', color: '#3b82f6' });
    const list = await agent.post('/api/lists').send({ boardId: board.body.id, title: 'Disposable List' });
    const card = await agent.post('/api/cards').send({ boardId: board.body.id, listId: list.body.id, title: 'Disposable Card' });

    const response = await agent.delete(`/api/boards/${board.body.id}`).send();
    expect(response.status).toBe(200);

    expect(db.prepare('SELECT id FROM boards WHERE id = ?').get(board.body.id)).toBeUndefined();
    expect(db.prepare('SELECT id FROM lists WHERE id = ?').get(list.body.id)).toBeUndefined();
    expect(db.prepare('SELECT id FROM cards WHERE id = ?').get(card.body.id)).toBeUndefined();
  });
});

describe('workspace routes', () => {
  afterEach(() => { closeDatabase(); });

  it('renames a workspace', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const response = await agent.patch('/api/workspaces/w1').send({ name: 'Operations' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Operations');
    const row = db.prepare('SELECT name FROM workspaces WHERE id = ?').get('w1') as { name: string };
    expect(row.name).toBe('Operations');
  });

  it('rejects renaming a workspace with a blank name', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const response = await agent.patch('/api/workspaces/w1').send({ name: '   ' });

    expect(response.status).toBe(400);
  });

  it('deletes a workspace and cascades related records', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const workspace = await agent.post('/api/workspaces').send({ name: 'Disposable Workspace', description: '', visibility: 'private' });
    const board = await agent.post('/api/boards').send({ workspaceId: workspace.body.id, title: 'Workspace Board', color: '#10b981' });

    const response = await agent.delete(`/api/workspaces/${workspace.body.id}`).send();
    expect(response.status).toBe(200);

    expect(db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspace.body.id)).toBeUndefined();
    expect(db.prepare('SELECT id FROM boards WHERE id = ?').get(board.body.id)).toBeUndefined();
  });
});

describe('list CRUD routes', () => {
  afterEach(() => { closeDatabase(); });

  it('creates a list in a board', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const res = await agent.post('/api/lists').send({ boardId: 'b1', title: 'New List' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('New List');
    expect(res.body.boardId).toBe('b1');
    expect(res.body.archived).toBe(false);
  });

  it('updates a list title', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    // Create a list to get an ID
    const created = await agent.post('/api/lists').send({ boardId: 'b1', title: 'Original' });
    const listId = created.body.id;

    const res = await agent.patch(`/api/lists/${listId}`).send({ title: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Renamed');
  });

  it('archives and restores a list', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const created = await agent.post('/api/lists').send({ boardId: 'b1', title: 'Archivable' });
    const listId = created.body.id;

    const archiveRes = await agent.post(`/api/lists/${listId}/archive`).send();
    expect(archiveRes.status).toBe(200);

    const restoreRes = await agent.post(`/api/lists/${listId}/restore`).send();
    expect(restoreRes.status).toBe(200);
  });

  it('moves a list position', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const created = await agent.post('/api/lists').send({ boardId: 'b1', title: 'Movable' });
    const listId = created.body.id;

    const res = await agent.post(`/api/lists/${listId}/move`).send({ toPosition: 0 });
    expect(res.status).toBe(200);
  });

  it('returns 404 for non-existent list', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const res = await agent.patch('/api/lists/nonexistent').send({ title: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('card CRUD routes', () => {
  afterEach(() => { closeDatabase(); });

  it('creates a card with activity', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    // Create list first
    const list = await agent.post('/api/lists').send({ boardId: 'b1', title: 'List for cards' });

    const res = await agent.post('/api/cards').send({ boardId: 'b1', listId: list.body.id, title: 'Test Card' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Test Card');
    expect(res.body.boardId).toBe('b1');
    expect(res.body.listId).toBe(list.body.id);
    expect(res.body.activity).toHaveLength(1);
    expect(res.body.activity[0].action).toBe('created this card');
    expect(res.body.memberIds).toEqual([]);
    expect(res.body.labelIds).toEqual([]);
    expect(res.body.checklists).toEqual([]);
    expect(res.body.comments).toEqual([]);
    expect(res.body.attachments).toEqual([]);
    expect(res.body.watching).toBe(false);
    expect(res.body.archived).toBe(false);
  });

  it('updates card fields', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const list = await agent.post('/api/lists').send({ boardId: 'b1', title: 'List' });
    const card = await agent.post('/api/cards').send({ boardId: 'b1', listId: list.body.id, title: 'Original' });
    const cardId = card.body.id;

    // Update title
    const r1 = await agent.patch(`/api/cards/${cardId}`).send({ title: 'Updated Title' });
    expect(r1.status).toBe(200);
    expect(r1.body.title).toBe('Updated Title');

    // Update description
    const r2 = await agent.patch(`/api/cards/${cardId}`).send({ description: 'A description' });
    expect(r2.body.description).toBe('A description');

    // Update labels
    const r3 = await agent.patch(`/api/cards/${cardId}`).send({ labelIds: ['lb1', 'lb2'] });
    expect(r3.body.labelIds).toEqual(['lb1', 'lb2']);

    // Update members
    const r4 = await agent.patch(`/api/cards/${cardId}`).send({ memberIds: ['u1', 'u2'] });
    expect(r4.body.memberIds).toEqual(['u1', 'u2']);

    // Update due date
    const dueDate = '2025-12-31T00:00:00.000Z';
    const r5 = await agent.patch(`/api/cards/${cardId}`).send({ dueDate });
    expect(r5.body.dueDate).toBe(dueDate);

    // Mark due date complete
    const r6 = await agent.patch(`/api/cards/${cardId}`).send({ dueDateComplete: true });
    expect(r6.body.dueDateComplete).toBe(true);

    // Update watching
    const r7 = await agent.patch(`/api/cards/${cardId}`).send({ watching: true });
    expect(r7.body.watching).toBe(true);

    // Update checklists
    const checklists = [{ id: 'cl1', title: 'Todo', items: [{ id: 'ci1', text: 'Item 1', completed: false }] }];
    const r8 = await agent.patch(`/api/cards/${cardId}`).send({ checklists });
    expect(r8.body.checklists).toEqual(checklists);

    // Update comments
    const comments = [{ id: 'cm1', userId: 'u1', text: 'Hello', createdAt: new Date().toISOString() }];
    const r9 = await agent.patch(`/api/cards/${cardId}`).send({ comments });
    expect(r9.body.comments).toEqual(comments);

    // Update attachments
    const attachments = [{ id: 'at1', name: 'test.pdf', url: 'https://example.com/test.pdf', type: 'link' as const, addedAt: new Date().toISOString() }];
    const r10 = await agent.patch(`/api/cards/${cardId}`).send({ attachments });
    expect(r10.body.attachments).toEqual(attachments);

    // Archive
    const r11 = await agent.patch(`/api/cards/${cardId}`).send({ archived: true });
    expect(r11.body.archived).toBe(true);
  });

  it('persists large uploaded attachment payloads', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const list = await agent.post('/api/lists').send({ boardId: 'b1', title: 'Attachment List' });
    const card = await agent.post('/api/cards').send({ boardId: 'b1', listId: list.body.id, title: 'Attachment Card' });
    const cardId = card.body.id;

    const largePayload = 'a'.repeat(220_000);
    const attachments = [{
      id: 'at-large',
      name: 'diagram.png',
      kind: 'file' as const,
      url: `data:image/png;base64,${largePayload}`,
      size: 165000,
      mimeType: 'image/png',
      createdAt: new Date().toISOString(),
    }];

    const response = await agent.patch(`/api/cards/${cardId}`).send({ attachments });
    expect(response.status).toBe(200);
    expect(response.body.attachments).toEqual(attachments);

    const session = await agent.get('/api/auth/session');
    expect(session.status).toBe(200);
    const persistedCard = session.body.appState.cards.find((candidate: { id: string }) => candidate.id === cardId);
    expect(persistedCard?.attachments).toEqual(attachments);
  });

  it('moves a card between lists', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const list1 = await agent.post('/api/lists').send({ boardId: 'b1', title: 'Source' });
    const list2 = await agent.post('/api/lists').send({ boardId: 'b1', title: 'Dest' });
    const card = await agent.post('/api/cards').send({ boardId: 'b1', listId: list1.body.id, title: 'Moving Card' });

    const res = await agent.post(`/api/cards/${card.body.id}/move`).send({ toListId: list2.body.id, toPosition: 0 });
    expect(res.status).toBe(200);
    expect(res.body.listId).toBe(list2.body.id);
  });

  it('applies card_created automations on the server before returning the new card', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const intake = await agent.post('/api/lists').send({ boardId: 'b1', title: 'Automation Intake' });
    const review = await agent.post('/api/lists').send({ boardId: 'b1', title: 'Automation Review' });

    await agent.post('/api/automation-rules').send({
      boardId: 'b1',
      name: 'Label new cards',
      trigger: 'card_created',
      triggerConfig: {},
      conditions: { listId: intake.body.id, labelId: null },
      action: 'add_label',
      actionConfig: { labelId: 'lb1' },
      enabled: true,
    });

    await agent.post('/api/automation-rules').send({
      boardId: 'b1',
      name: 'Move new cards to review',
      trigger: 'card_created',
      triggerConfig: {},
      conditions: { listId: intake.body.id, labelId: 'lb1' },
      action: 'move_to_list',
      actionConfig: { listId: review.body.id },
      enabled: true,
    });

    const res = await agent.post('/api/cards').send({ boardId: 'b1', listId: intake.body.id, title: 'Created with automation' });

    expect(res.status).toBe(201);
    expect(res.body.labelIds).toContain('lb1');
    expect(res.body.listId).toBe(review.body.id);
  });

  it('applies card_moved automations on the server and persists notifications', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    await agent.post('/api/automation-rules').send({
      boardId: 'b1',
      name: 'Assign reviewer on done',
      trigger: 'card_moved',
      triggerConfig: { toListId: 'l5' },
      conditions: { listId: null, labelId: null },
      action: 'assign_member',
      actionConfig: { memberId: 'u2' },
      enabled: true,
    });

    await agent.post('/api/automation-rules').send({
      boardId: 'b1',
      name: 'Complete due date on done',
      trigger: 'card_moved',
      triggerConfig: { toListId: 'l5' },
      conditions: { listId: null, labelId: null },
      action: 'mark_due_complete',
      actionConfig: {},
      enabled: true,
    });

    const card = await agent.post('/api/cards').send({ boardId: 'b1', listId: 'l1', title: 'Move automation card' });
    await agent.patch(`/api/cards/${card.body.id}`).send({ dueDate: '2026-03-21T00:00:00.000Z' });

    const res = await agent.post(`/api/cards/${card.body.id}/move`).send({ toListId: 'l5', toPosition: 0 });

    expect(res.status).toBe(200);
    expect(res.body.listId).toBe('l5');
    expect(res.body.memberIds).toContain('u2');
    expect(res.body.dueDateComplete).toBe(true);

    const notifications = db.prepare('SELECT user_id as userId, message FROM notifications WHERE card_id = ?').all(card.body.id) as Array<{ userId: string; message: string }>;
    expect(notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'u2', message: expect.stringContaining('Automation assigned you') }),
      expect.objectContaining({ userId: 'u1', message: expect.stringContaining('Automation: Alex Chen assigned') }),
    ]));
  });

  it('applies checklist_complete automations when a checklist becomes fully complete', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    await agent.post('/api/automation-rules').send({
      boardId: 'b1',
      name: 'Complete due date when checklist finishes',
      trigger: 'checklist_complete',
      triggerConfig: {},
      conditions: { listId: null, labelId: null },
      action: 'mark_due_complete',
      actionConfig: {},
      enabled: true,
    });

    const card = await agent.post('/api/cards').send({ boardId: 'b1', listId: 'l1', title: 'Checklist automation card' });
    const updated = await agent.patch(`/api/cards/${card.body.id}`).send({
      dueDate: '2026-03-21T00:00:00.000Z',
      checklists: [{ id: 'ck1', title: 'Finish', items: [{ id: 'ci1', text: 'Done', completed: true }] }],
    });

    expect(updated.status).toBe(200);
    expect(updated.body.dueDateComplete).toBe(true);
  });

  it('deletes a card', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const list = await agent.post('/api/lists').send({ boardId: 'b1', title: 'Del List' });
    const card = await agent.post('/api/cards').send({ boardId: 'b1', listId: list.body.id, title: 'Deletable' });

    const res = await agent.delete(`/api/cards/${card.body.id}`).send();
    expect(res.status).toBe(204);

    // Verify it's gone
    const getRes = await agent.patch(`/api/cards/${card.body.id}`).send({ title: 'Ghost' });
    expect(getRes.status).toBe(404);
  });

  it('returns 404 for non-existent card', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const res = await agent.patch('/api/cards/nonexistent').send({ title: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('automation rule CRUD routes', () => {
  afterEach(() => { closeDatabase(); });

  it('creates an automation rule', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const res = await agent.post('/api/automation-rules').send({
      boardId: 'b1',
      name: 'Auto-assign',
      trigger: 'card_moved',
      triggerConfig: { toListId: 'l1' },
      conditions: { listId: null, labelId: null },
      action: 'assign_member',
      actionConfig: { memberId: 'u1' },
      enabled: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Auto-assign');
    expect(res.body.boardId).toBe('b1');
    expect(res.body.enabled).toBe(true);
    expect(res.body.trigger).toBe('card_moved');
    expect(res.body.action).toBe('assign_member');
  });

  it('rejects unsupported or invalid automation configurations', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const unsupported = await agent.post('/api/automation-rules').send({
      boardId: 'b1',
      name: 'Legacy due date rule',
      trigger: 'due_date_reached',
      triggerConfig: {},
      conditions: { listId: null, labelId: null },
      action: 'mark_due_complete',
      actionConfig: {},
      enabled: true,
    });
    expect(unsupported.status).toBe(400);

    const invalidMember = await agent.post('/api/automation-rules').send({
      boardId: 'b1',
      name: 'Assign outsider',
      trigger: 'card_created',
      triggerConfig: {},
      conditions: { listId: null, labelId: null },
      action: 'assign_member',
      actionConfig: { memberId: 'missing-user' },
      enabled: true,
    });
    expect(invalidMember.status).toBe(400);
    expect(invalidMember.body.message).toBe('Selected automation member does not belong to this board.');
  });

  it('initializes and resets scheduled lastRunAt values appropriately', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const created = await agent.post('/api/automation-rules').send({
      boardId: 'b1',
      name: 'Heartbeat rule',
      trigger: 'heartbeat',
      triggerConfig: { intervalValue: 1, intervalUnit: 'hours' },
      conditions: { listId: null, labelId: null },
      action: 'mark_due_complete',
      actionConfig: {},
      enabled: true,
    });

    expect(created.status).toBe(201);
    expect(created.body.lastRunAt).toBeTruthy();

    const updated = await agent.patch(`/api/automation-rules/${created.body.id}`).send({
      trigger: 'monthly',
      triggerConfig: { dayOfMonth: 14, time: '09:00' },
    });

    expect(updated.status).toBe(200);
    expect(updated.body.lastRunAt).toBeNull();
  });

  it('updates an automation rule', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const created = await agent.post('/api/automation-rules').send({
      boardId: 'b1', name: 'Rule', trigger: 'card_created', triggerConfig: {}, conditions: { listId: null, labelId: null },
      action: 'add_label', actionConfig: { labelId: 'lb1' }, enabled: true,
    });

    const res = await agent.patch(`/api/automation-rules/${created.body.id}`).send({ enabled: false, name: 'Disabled Rule' });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.name).toBe('Disabled Rule');
  });

  it('deletes an automation rule', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const created = await agent.post('/api/automation-rules').send({
      boardId: 'b1', name: 'ToDelete', trigger: 'card_created', triggerConfig: {}, conditions: { listId: null, labelId: null },
      action: 'mark_due_complete', actionConfig: {}, enabled: true,
    });

    const res = await agent.delete(`/api/automation-rules/${created.body.id}`).send();
    expect(res.status).toBe(204);
  });

  it('returns 404 for non-existent rule', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const res = await agent.patch('/api/automation-rules/nonexistent').send({ enabled: false });
    expect(res.status).toBe(404);
  });
});

describe('notification routes', () => {
  afterEach(() => { closeDatabase(); });

  it('marks all notifications read', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    const res = await agent.post('/api/notifications/read-all').send();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('data persistence across sessions', () => {
  afterEach(() => { closeDatabase(); });

  it('retains boards, lists, and cards after logout and login', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAdmin(app);

    // Create board
    const board = await agent.post('/api/boards').send({ workspaceId: 'w1', title: 'Persistent Board', color: '#f97316' });
    const boardId = board.body.id;

    // Create list
    const list = await agent.post('/api/lists').send({ boardId, title: 'Persistent List' });
    const listId = list.body.id;

    // Create card
    const card = await agent.post('/api/cards').send({ boardId, listId, title: 'Persistent Card' });
    const cardId = card.body.id;

    // Update card with description and checklists
    await agent.patch(`/api/cards/${cardId}`).send({
      description: 'This should persist',
      checklists: [{ id: 'cl-persist', title: 'Persist Check', items: [{ id: 'ci-persist', text: 'Item', completed: true }] }],
    });

    // Logout
    await agent.post('/api/auth/logout').send();

    // Login again
    const agent2 = request.agent(app);
    await agent2.post('/api/auth/login').send({ username: 'admin', password: 'ChangeThisNow123!' });

    // Fetch session - data should be there
    const session = await agent2.get('/api/auth/session');
    expect(session.status).toBe(200);

    const state = session.body.appState;
    expect(state.boards.some((b: { id: string }) => b.id === boardId)).toBe(true);
    expect(state.lists.some((l: { id: string }) => l.id === listId)).toBe(true);

    const persistedCard = state.cards.find((c: { id: string }) => c.id === cardId);
    expect(persistedCard).toBeTruthy();
    expect(persistedCard.title).toBe('Persistent Card');
    expect(persistedCard.description).toBe('This should persist');
    expect(persistedCard.checklists).toHaveLength(1);
    expect(persistedCard.checklists[0].items[0].completed).toBe(true);
  });
});
