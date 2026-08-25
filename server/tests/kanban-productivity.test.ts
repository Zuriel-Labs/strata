// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { closeDatabase, createDatabase } from '../src/db/database';
import { createApp } from '../src/app';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
});

async function loginAdmin(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'ChangeMe123!' });
  await agent.post('/api/auth/password/change').send({ currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!', confirmPassword: 'ChangeThisNow123!' });
  return agent;
}

function activeOrder(db: Awaited<ReturnType<typeof createDatabase>>, listId: string) {
  return db.prepare('SELECT id, position FROM cards WHERE list_id = ? AND archived = 0 ORDER BY position, id').all(listId) as Array<{ id: string; position: number }>;
}

describe('transactional card ordering', () => {
  afterEach(() => closeDatabase());

  it('places cards at exact positions within one list and compacts positions', async () => {
    const db = await createDatabase(':memory:');
    const agent = await loginAdmin(createApp(db));

    const response = await agent.post('/api/cards/c6/move').send({ toListId: 'l1', toPosition: 0 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 'c6', listId: 'l1', position: 0 });
    expect(activeOrder(db, 'l1')).toEqual([{ id: 'c6', position: 0 }, { id: 'c5', position: 1 }]);
  });

  it('places a card between destination cards and compacts both lists', async () => {
    const db = await createDatabase(':memory:');
    const agent = await loginAdmin(createApp(db));

    const response = await agent.post('/api/cards/c6/move').send({ toListId: 'l2', toPosition: 1 });

    expect(response.status).toBe(200);
    expect(activeOrder(db, 'l1')).toEqual([{ id: 'c5', position: 0 }]);
    expect(activeOrder(db, 'l2')).toEqual([
      { id: 'c3', position: 0 },
      { id: 'c6', position: 1 },
      { id: 'c4', position: 2 },
    ]);
  });

  it('rejects missing, archived, and cross-board destinations without mutation', async () => {
    const db = await createDatabase(':memory:');
    const agent = await loginAdmin(createApp(db));
    const before = activeOrder(db, 'l1');
    db.prepare("UPDATE lists SET archived = 1 WHERE id = 'l4'").run();

    expect((await agent.post('/api/cards/c6/move').send({ toListId: 'missing', toPosition: 0 })).status).toBe(400);
    expect((await agent.post('/api/cards/c6/move').send({ toListId: 'l4', toPosition: 0 })).status).toBe(400);
    expect((await agent.post('/api/cards/c6/move').send({ toListId: 'l6', toPosition: 0 })).status).toBe(400);
    expect(activeOrder(db, 'l1')).toEqual(before);
  });

  it('rolls back every position when a statement fails', async () => {
    const db = await createDatabase(':memory:');
    const agent = await loginAdmin(createApp(db));
    const beforeSource = activeOrder(db, 'l1');
    const beforeDestination = activeOrder(db, 'l2');
    db.exec("CREATE TRIGGER injected_move_failure BEFORE UPDATE OF position ON cards WHEN NEW.id = 'c4' BEGIN SELECT RAISE(ABORT, 'injected move failure'); END;");

    const response = await agent.post('/api/cards/c6/move').send({ toListId: 'l2', toPosition: 1 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Unable to move card.' });
    expect(activeOrder(db, 'l1')).toEqual(beforeSource);
    expect(activeOrder(db, 'l2')).toEqual(beforeDestination);
  });

  it('records one board-scoped audit event with relational metadata', async () => {
    const db = await createDatabase(':memory:');
    const agent = await loginAdmin(createApp(db));

    await agent.post('/api/cards/c6/move').send({ toListId: 'l2', toPosition: 1 });

    const events = db.prepare("SELECT scope_id as scopeId, metadata_json as metadataJson FROM audit_events WHERE action = 'card.move'").all() as Array<{ scopeId: string; metadataJson: string }>;
    expect(events).toHaveLength(1);
    expect(events[0].scopeId).toBe('b1');
    expect(JSON.parse(events[0].metadataJson)).toMatchObject({ cardId: 'c6', fromListId: 'l1', toListId: 'l2', toPosition: 1 });
  });

  it('denies a board member from moving a card directly', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: 'priya', password: 'Member12345!' });

    const response = await agent.post('/api/cards/c6/move').send({ toListId: 'l2', toPosition: 0 });

    expect(response.status).toBe(403);
    expect(activeOrder(db, 'l1')).toEqual([{ id: 'c5', position: 0 }, { id: 'c6', position: 1 }]);
  });
});

describe('transactional card duplication', () => {
  afterEach(() => closeDatabase());

  it('deep-copies the content contract immediately after the source with independent nested identities', async () => {
    const db = await createDatabase(':memory:');
    const agent = await loginAdmin(createApp(db));
    const descriptionDocument = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Launch plan', marks: [{ type: 'bold' }] }] }] };
    const sourceUpdate = await agent.patch('/api/cards/c5').send({
      descriptionDocument,
      memberIds: ['u2'],
      labelIds: ['lb1'],
      checklists: [{ id: 'source-checklist', title: 'Release', items: [{ id: 'source-item', text: 'Verify', completed: true }] }],
      dueDate: '2026-09-01T00:00:00.000Z',
      dueDateComplete: true,
      comments: [{ id: 'source-comment', userId: 'u1', text: 'History', createdAt: '2026-08-01T00:00:00.000Z' }],
      attachments: [{ id: 'source-attachment', name: 'brief.txt', kind: 'file', url: 'data:text/plain;base64,SGk=', size: 2, mimeType: 'text/plain', createdAt: '2026-08-01T00:00:00.000Z' }],
      watching: true,
    });
    expect(sourceUpdate.status).toBe(200);

    const response = await agent.post('/api/cards/c5/duplicate').send({});

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      title: 'Evaluate state management options (copy)',
      descriptionDocument,
      listId: 'l1',
      boardId: 'b1',
      position: 1,
      memberIds: ['u2'],
      labelIds: ['lb1'],
      dueDate: '2026-09-01T00:00:00.000Z',
      dueDateComplete: true,
      comments: [],
      watching: false,
      archived: false,
    });
    expect(response.body.id).not.toBe('c5');
    expect(response.body.createdAt).not.toBe(sourceUpdate.body.createdAt);
    expect(response.body.activity).toEqual([expect.objectContaining({ action: 'duplicated this card' })]);
    expect(response.body.checklists[0].id).not.toBe('source-checklist');
    expect(response.body.checklists[0].items[0]).toMatchObject({ text: 'Verify', completed: true });
    expect(response.body.checklists[0].items[0].id).not.toBe('source-item');
    expect(response.body.attachments[0]).toMatchObject({ name: 'brief.txt', url: 'data:text/plain;base64,SGk=' });
    expect(response.body.attachments[0].id).not.toBe('source-attachment');
    expect(activeOrder(db, 'l1')).toEqual([
      { id: 'c5', position: 0 },
      { id: response.body.id, position: 1 },
      { id: 'c6', position: 2 },
    ]);
  });

  it('runs card-created automation exactly once and records relational audit metadata', async () => {
    const db = await createDatabase(':memory:');
    const agent = await loginAdmin(createApp(db));
    const rule = await agent.post('/api/automation-rules').send({
      boardId: 'b1', name: 'Label duplicates', trigger: 'card_created', triggerConfig: {}, conditions: { listId: null, labelId: null },
      action: 'add_label', actionConfig: { labelId: 'lb1' }, enabled: true,
    });
    expect(rule.status).toBe(201);

    const response = await agent.post('/api/cards/c5/duplicate').send({});
    expect(response.status).toBe(201);
    expect(response.body.labelIds.filter((id: string) => id === 'lb1')).toHaveLength(1);
    expect(response.body.activity.filter((entry: { action: string }) => entry.action === 'automatically added a label')).toHaveLength(1);

    const audit = db.prepare("SELECT metadata_json as metadataJson FROM audit_events WHERE action = 'card.duplicate'").all() as Array<{ metadataJson: string }>;
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0].metadataJson)).toEqual({ sourceCardId: 'c5', duplicateCardId: response.body.id });
  });

  it('keeps watching only when the duplicating actor is assigned to and watching the source', async () => {
    const db = await createDatabase(':memory:');
    const agent = await loginAdmin(createApp(db));

    await agent.patch('/api/cards/c5').send({ memberIds: ['u1'], watching: true });
    const memberWatcherCopy = await agent.post('/api/cards/c5/duplicate').send({});
    expect(memberWatcherCopy.status).toBe(201);
    expect(memberWatcherCopy.body.watching).toBe(true);

    await agent.patch('/api/cards/c6').send({ memberIds: ['u1'], watching: false });
    const memberNotWatchingCopy = await agent.post('/api/cards/c6/duplicate').send({});
    expect(memberNotWatchingCopy.status).toBe(201);
    expect(memberNotWatchingCopy.body.watching).toBe(false);
  });

  it('rolls back inserted content and positions after an injected failure', async () => {
    const db = await createDatabase(':memory:');
    const agent = await loginAdmin(createApp(db));
    const before = activeOrder(db, 'l1');
    db.exec("CREATE TRIGGER fail_duplicate BEFORE INSERT ON cards WHEN NEW.title LIKE '%(copy)' BEGIN SELECT RAISE(ABORT, 'injected duplicate failure'); END;");

    const response = await agent.post('/api/cards/c5/duplicate').send({});

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Unable to duplicate card.' });
    expect(activeOrder(db, 'l1')).toEqual(before);
    expect(db.prepare("SELECT id FROM cards WHERE title LIKE '%(copy)'").all()).toEqual([]);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'card.duplicate'").all()).toEqual([]);
  });

  it('rejects missing sources and direct read-only requests', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const admin = await loginAdmin(app);
    expect((await admin.post('/api/cards/missing/duplicate').send({})).status).toBe(404);

    const member = request.agent(app);
    await member.post('/api/auth/login').send({ username: 'priya', password: 'Member12345!' });
    expect((await member.post('/api/cards/c5/duplicate').send({})).status).toBe(403);
  });
});

describe('transactional list sorting', () => {
  afterEach(() => closeDatabase());

  function prepareSortableCards(db: Awaited<ReturnType<typeof createDatabase>>) {
    db.prepare("UPDATE cards SET title = 'álpha', position = 0 WHERE id = 'c5'").run();
    db.prepare("UPDATE cards SET title = 'Alpha', position = 1 WHERE id = 'c6'").run();
    db.prepare(`INSERT INTO cards (
      id, title, description, list_id, board_id, position, member_ids_json, label_ids_json,
      checklists_json, due_date, due_date_complete, comments_json, activity_json,
      attachments_json, watching, archived, created_at
    ) VALUES ('sort-10', 'item 10', '', 'l1', 'b1', 2, '[]', '[]', '[]', NULL, 0, '[]', '[]', '[]', 0, 0, '2026-08-01T00:00:00.000Z'),
             ('sort-2', ' Item 2 ', '', 'l1', 'b1', 3, '[]', '[]', '[]', NULL, 0, '[]', '[]', '[]', 0, 0, '2026-08-01T00:00:00.000Z'),
             ('archived-sort', 'Aardvark', '', 'l1', 'b1', 91, '[]', '[]', '[]', NULL, 0, '[]', '[]', '[]', 0, 1, '2026-08-01T00:00:00.000Z')`).run();
  }

  it('sorts every active card using fixed case/accent/numeric collation and preserves stable ties', async () => {
    const db = await createDatabase(':memory:');
    const agent = await loginAdmin(createApp(db));
    prepareSortableCards(db);

    const ascending = await agent.post('/api/lists/l1/sort').send({ direction: 'asc' });
    expect(ascending.status).toBe(200);
    expect(ascending.body).toMatchObject({ listId: 'l1', direction: 'asc' });
    expect(ascending.body.cards.map((card: { id: string }) => card.id)).toEqual(['c5', 'c6', 'sort-2', 'sort-10']);
    expect(activeOrder(db, 'l1')).toEqual([
      { id: 'c5', position: 0 }, { id: 'c6', position: 1 }, { id: 'sort-2', position: 2 }, { id: 'sort-10', position: 3 },
    ]);

    const descending = await agent.post('/api/lists/l1/sort').send({ direction: 'desc' });
    expect(descending.status).toBe(200);
    expect(descending.body.cards.map((card: { id: string }) => card.id)).toEqual(['sort-10', 'sort-2', 'c5', 'c6']);
    expect(db.prepare("SELECT position FROM cards WHERE id = 'archived-sort'").pluck().get()).toBe(91);
  });

  it('is a side-effect-free no-op for empty and single-card lists', async () => {
    const db = await createDatabase(':memory:');
    const agent = await loginAdmin(createApp(db));
    db.prepare("UPDATE cards SET archived = 1 WHERE list_id = 'l3'").run();

    const empty = await agent.post('/api/lists/l3/sort').send({ direction: 'asc' });
    const single = await agent.post('/api/lists/l4/sort').send({ direction: 'desc' });

    expect(empty.status).toBe(200);
    expect(empty.body.cards).toEqual([]);
    expect(single.status).toBe(200);
    expect(single.body.cards).toHaveLength(1);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'list.sort'").all()).toEqual([]);
  });

  it('rolls back all positions and audit data when persistence fails', async () => {
    const db = await createDatabase(':memory:');
    const agent = await loginAdmin(createApp(db));
    prepareSortableCards(db);
    const before = activeOrder(db, 'l1');
    db.exec("CREATE TRIGGER injected_sort_failure BEFORE UPDATE OF position ON cards WHEN NEW.id = 'sort-2' BEGIN SELECT RAISE(ABORT, 'injected sort failure'); END;");

    const response = await agent.post('/api/lists/l1/sort').send({ direction: 'desc' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: 'Unable to sort list.' });
    expect(activeOrder(db, 'l1')).toEqual(before);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'list.sort'").all()).toEqual([]);
  });

  it('records one audit event without invoking card-moved automation', async () => {
    const db = await createDatabase(':memory:');
    const agent = await loginAdmin(createApp(db));
    prepareSortableCards(db);
    const activityBefore = db.prepare("SELECT activity_json FROM cards WHERE id = 'c5'").pluck().get();

    const response = await agent.post('/api/lists/l1/sort').send({ direction: 'desc' });

    expect(response.status).toBe(200);
    const audits = db.prepare("SELECT scope_id as scopeId, metadata_json as metadataJson FROM audit_events WHERE action = 'list.sort'").all() as Array<{ scopeId: string; metadataJson: string }>;
    expect(audits).toHaveLength(1);
    expect(audits[0].scopeId).toBe('b1');
    expect(JSON.parse(audits[0].metadataJson)).toEqual({ listId: 'l1', direction: 'desc', cardCount: 4 });
    expect(db.prepare("SELECT activity_json FROM cards WHERE id = 'c5'").pluck().get()).toBe(activityBefore);
  });

  it('strictly validates input and denies read-only users without mutation', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const admin = await loginAdmin(app);
    const before = activeOrder(db, 'l1');
    expect((await admin.post('/api/lists/missing/sort').send({ direction: 'asc' })).status).toBe(404);
    expect((await admin.post('/api/lists/l1/sort').send({ direction: 'sideways' })).status).toBe(400);
    expect((await admin.post('/api/lists/l1/sort').send({ direction: 'asc', extra: true })).status).toBe(400);

    const member = request.agent(app);
    await member.post('/api/auth/login').send({ username: 'priya', password: 'Member12345!' });
    expect((await member.post('/api/lists/l1/sort').send({ direction: 'desc' })).status).toBe(403);
    expect(activeOrder(db, 'l1')).toEqual(before);
  });
});
