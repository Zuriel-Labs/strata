// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase, closeDatabase } from '../src/db/database';
import { createApp } from '../src/app';
import { archiveList, restoreList, createAutomationRuleWithConditions } from '../src/db/repositories';
import { applyRealtimeAutomations } from '../src/automation/realtime';
import { getCardById } from '../src/db/repositories';
import { runScheduledAutomations } from '../src/automation/runner';

beforeAll(() => { process.env.SEED_DATA = 'true'; });
afterEach(() => { closeDatabase(); });

async function admin(db: Awaited<ReturnType<typeof createDatabase>>) {
  const agent = request.agent(createApp(db));
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'ChangeMe123!' });
  await agent.post('/api/auth/password/change').send({ currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!', confirmPassword: 'ChangeThisNow123!' });
  return agent;
}

describe('lifecycle transaction foundations', () => {
  it.each([
    ['workspace.create', '/api/workspaces', { name: 'Rollback' }],
    ['board.create', '/api/boards', { workspaceId: 'w1', title: 'Rollback', color: '#112233' }],
    ['list.create', '/api/lists', { boardId: 'b1', title: 'Rollback' }],
    ['card.create', '/api/cards', { boardId: 'b1', listId: 'l1', title: 'Rollback' }],
  ])('keeps %s domain rows and audit atomic', async (action, path, body) => {
    const db = await createDatabase(':memory:');
    const agent = await admin(db);
    const tables = ['workspaces', 'boards', 'lists', 'cards', 'audit_events'];
    const before = tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    db.exec(`CREATE TRIGGER fail_write_audit BEFORE INSERT ON audit_events WHEN NEW.action = '${action}' BEGIN SELECT RAISE(ABORT, 'injected'); END`);
    expect((await agent.post(path).send(body)).status).toBe(500);
    expect(tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())).toEqual(before);
  });
  it('restores only cards archived by this list operation and leaves legacy ambiguous archives alone', async () => {
    const db = await createDatabase(':memory:');
    const cards = db.prepare('SELECT id FROM cards WHERE list_id = ? ORDER BY id').all('l1') as { id: string }[];
    expect(cards.length).toBeGreaterThan(1);
    db.prepare('UPDATE cards SET archived = 1 WHERE id = ?').run(cards[0].id);
    archiveList(db, 'l1');
    archiveList(db, 'l1');
    restoreList(db, 'l1');
    expect(db.prepare('SELECT archived FROM cards WHERE id = ?').pluck().get(cards[0].id)).toBe(1);
    expect(db.prepare('SELECT archived FROM cards WHERE id = ?').pluck().get(cards[1].id)).toBe(0);
    db.prepare('UPDATE lists SET archived = 1 WHERE id = ?').run('l1');
    db.prepare('UPDATE cards SET archived = 1, archived_by_list_id = NULL WHERE list_id = ?').run('l1');
    restoreList(db, 'l1');
    expect(db.prepare('SELECT COUNT(*) FROM cards WHERE list_id = ? AND archived = 0').pluck().get('l1')).toBe(0);
  });

  it('restores an archived list after new lists without duplicate active positions', async () => {
    const db = await createDatabase(':memory:');
    const agent = await admin(db);
    archiveList(db, 'l5');
    expect((await agent.post('/api/lists').send({ boardId: 'b1', title: 'Created while archived' })).status).toBe(201);
    expect((await agent.post('/api/lists/l5/restore').send({})).status).toBe(200);
    const positions = db.prepare('SELECT position FROM lists WHERE board_id = ? AND archived = 0 ORDER BY position').pluck().all('b1');
    expect(positions).toEqual(positions.map((_, index) => index));
  });

  it('rolls back list archive and descendants when the success audit cannot be stored', async () => {
    const db = await createDatabase(':memory:');
    const agent = await admin(db);
    const before = db.prepare('SELECT * FROM cards WHERE list_id = ? ORDER BY id').all('l1');
    db.exec("CREATE TRIGGER fail_archive_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'list.archive' BEGIN SELECT RAISE(ABORT, 'injected'); END");
    const response = await agent.post('/api/lists/l1/archive').send({});
    expect(response.status).toBe(500);
    expect(db.prepare('SELECT archived FROM lists WHERE id = ?').pluck().get('l1')).toBe(0);
    expect(db.prepare('SELECT * FROM cards WHERE list_id = ? ORDER BY id').all('l1')).toEqual(before);
  });
});

describe('closed parents and templates', () => {
  it('closes a workspace reversibly, blocks ordinary writes and keeps independent child state', async () => {
    const db = await createDatabase(':memory:');
    const agent = await admin(db);
    const closed = await agent.post('/api/workspaces/w1/close').send({ expectedRevision: 0 });
    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({ id: 'w1', lifecycleState: 'closed', revision: 1 });
    expect((await agent.post('/api/workspaces/w1/close').send({ expectedRevision: 0 })).status).toBe(200);
    expect((await agent.post('/api/cards').send({ boardId: 'b1', listId: 'l1', title: 'Denied' })).status).toBe(409);
    expect((await agent.patch('/api/boards/b1').send({ title: 'Denied' })).status).toBe(409);
    expect((await agent.post('/api/boards').send({ workspaceId: 'w1', title: 'Denied', color: '#000000' })).status).toBe(409);
    expect((await agent.post('/api/boards/b1/reopen').send({ expectedRevision: 0 })).status).toBe(409);
    const state = await agent.get('/api/workspaces/bootstrap');
    expect(state.body.appState.workspaces.find((w: { id: string }) => w.id === 'w1').lifecycleState).toBe('closed');
    expect((await agent.post('/api/workspaces/w1/reopen').send({ expectedRevision: 0 })).status).toBe(409);
    expect((await agent.post('/api/workspaces/w1/reopen').send({ expectedRevision: 1 })).status).toBe(200);
    expect((await agent.patch('/api/boards/b1').send({ title: 'Allowed' })).status).toBe(200);
    expect(db.prepare("SELECT COUNT(*) FROM audit_events WHERE action = 'workspace.close'").pluck().get()).toBe(1);
  });

  it('blocks card restore beneath an archived list and pauses scheduled automation under a closed board', async () => {
    const db = await createDatabase(':memory:');
    const agent = await admin(db);
    archiveList(db, 'l1');
    expect((await agent.patch('/api/cards/c5').send({ archived: false })).status).toBe(409);
    restoreList(db, 'l1');
    await agent.post('/api/automation-rules').send({ boardId: 'b1', name: 'Scheduled', trigger: 'date_time', triggerConfig: { runAt: '2020-01-01T00:00:00.000Z' }, conditions: { listId: null, labelId: null }, action: 'mark_due_complete', actionConfig: {}, enabled: true });
    expect((await agent.post('/api/boards/b1/close').send({ expectedRevision: 0 })).status).toBe(200);
    const before = db.prepare('SELECT * FROM cards WHERE board_id = ? ORDER BY id').all('b1');
    runScheduledAutomations(db);
    expect(db.prepare('SELECT * FROM cards WHERE board_id = ? ORDER BY id').all('b1')).toEqual(before);
    expect(db.prepare("SELECT last_run_at FROM automation_rules WHERE name = 'Scheduled'").pluck().get()).toBeNull();
  });

  it('excludes closed boards and templates from recents and automatic defaults', async () => {
    const db = await createDatabase(':memory:');
    const agent = await admin(db);
    db.prepare('UPDATE users SET default_workspace_id = ?, default_board_id = ? WHERE id = ?').run('w1', 'b1', 'u1');
    await agent.put('/api/auth/navigation/boards/b1/visit').send({});
    await agent.post('/api/workspaces/w1/close').send({ expectedRevision: 0 });
    const state = await agent.get('/api/workspaces/bootstrap');
    expect(state.body.appState.currentWorkspaceId).toBe('w2');
    const recent = await agent.get('/api/auth/navigation?kind=recent');
    expect(recent.status).toBe(200);
    expect(recent.body.items.some((item: { boardId: string }) => item.boardId === 'b1')).toBe(false);
    expect((await agent.put('/api/auth/navigation/boards/b1/visit').send({})).status).not.toBe(200);
  });

  it('rolls back scheduled effects and last-run state together when their audit fails', async () => {
    const db = await createDatabase(':memory:');
    createAutomationRuleWithConditions(db, 'scheduled-atomic', 'b1', 'Atomic', 'date_time', { runAt: '2020-01-01T00:00:00.000Z' }, { listId: 'l1', labelId: null }, 'mark_due_complete', {}, true, null);
    const before = db.prepare('SELECT * FROM cards ORDER BY id').all();
    db.exec("CREATE TRIGGER fail_scheduled_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'automation.execute' BEGIN SELECT RAISE(ABORT, 'injected'); END");
    expect(() => runScheduledAutomations(db)).toThrow();
    expect(db.prepare('SELECT * FROM cards ORDER BY id').all()).toEqual(before);
    expect(db.prepare('SELECT last_run_at FROM automation_rules WHERE id = ?').pluck().get('scheduled-atomic')).toBeNull();
  });

  it('keeps template collaboration and realtime rules dormant while preserving editable template content', async () => {
    const db = await createDatabase(':memory:');
    const agent = await admin(db);
    createAutomationRuleWithConditions(db, 'template-rule', 'b1', 'Dormant', 'card_created', {}, { listId: null, labelId: null }, 'mark_due_complete', {}, true, null);
    await agent.put('/api/boards/b1/template').send({ isTemplate: true, expectedRevision: 0 });
    const card = getCardById(db, 'c5')!;
    expect(applyRealtimeAutomations(db, card, 'card_created', 'u1').dueDateComplete).toBe(false);
    expect((await agent.post('/api/cards/c5/comments').send({ text: 'Not live collaboration' })).status).toBe(409);
    expect((await agent.patch('/api/cards/c5').send({ memberIds: ['u3'] })).status).toBe(409);
    expect((await agent.patch('/api/cards/c5').send({ title: 'Template content' })).status).toBe(200);
  });

  it('turns a private template back into a board without changing its content', async () => {
    const db = await createDatabase(':memory:');
    const agent = await admin(db);
    const before = db.prepare('SELECT * FROM cards WHERE board_id = ? ORDER BY id').all('b1');
    const template = await agent.put('/api/boards/b1/template').send({ isTemplate: true, expectedRevision: 0 });
    expect(template.status).toBe(200);
    expect(template.body).toMatchObject({ isTemplate: true, visibility: 'private', revision: 1 });
    expect((await agent.put('/api/boards/b1/template').send({ isTemplate: false, expectedRevision: 1 })).status).toBe(200);
    expect(db.prepare('SELECT * FROM cards WHERE board_id = ? ORDER BY id').all('b1')).toEqual(before);
  });
});
