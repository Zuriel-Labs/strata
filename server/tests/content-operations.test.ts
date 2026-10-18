// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase, closeDatabase } from '../src/db/database';
import { createAutomationRuleWithConditions } from '../src/db/repositories';
import { createApp } from '../src/app';

beforeAll(() => { process.env.SEED_DATA = 'true'; });
afterEach(() => { closeDatabase(); });
async function setup() {
  const db = await createDatabase(':memory:');
  const agent = request.agent(createApp(db));
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'ChangeMe123!' });
  await agent.post('/api/auth/password/change').send({ currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!', confirmPassword: 'ChangeThisNow123!' });
  return { db, agent };
}

describe('reviewed content operations', () => {
  it('rejects invalid destination assignments and contradictory parent selections', async () => {
    const { agent } = await setup();
    const base = { kind: 'card_copy', sourceId: 'c5', destinationListId: 'l2' };
    expect((await agent.post('/api/content-operations/preview').send({ ...base, memberMap: [{ sourceId: 'u1', destinationId: 'not-a-member' }] })).status).toBe(409);
    expect((await agent.post('/api/content-operations/preview').send({ ...base, destinationBoardId: 'b2' })).status).toBe(400);
    expect((await agent.post('/api/content-operations/preview').send({ ...base, keep: { cards: false } })).status).toBe(400);
    expect((await agent.post('/api/content-operations/preview').send({ kind: 'board_move', sourceId: 'b1', destinationWorkspaceId: 'w1' })).status).toBe(400);
  });

  it('blocks previews and lifecycle mutations until the initial password is changed', async () => {
    const { db } = await setup();
    db.prepare('UPDATE users SET must_change_password = 1 WHERE id = ?').run('u1');
    const agent = request.agent(createApp(db));
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'ChangeThisNow123!' });
    expect((await agent.post('/api/content-operations/preview').send({ kind: 'board_copy', sourceId: 'b1', destinationWorkspaceId: 'w1' })).status).toBe(403);
    expect((await agent.post('/api/boards/b1/close').send({ expectedRevision: 0 })).status).toBe(403);
    expect((await agent.get('/api/workspaces/w1/collections')).status).toBe(403);
  });

  it('commits one copied graph and local effect across concurrent retries, returning final revisions', async () => {
    const { db, agent } = await setup();
    createAutomationRuleWithConditions(db, 'copy-rule', 'b1', 'Mark copy complete', 'card_created', {}, { listId: null, labelId: null }, 'mark_due_complete', {}, true, null);
    const input = { kind: 'card_copy', sourceId: 'c5', destinationListId: 'l2' };
    const preview = await agent.post('/api/content-operations/preview').send(input);
    const key = randomUUID();
    const responses = await Promise.all([1, 2].map(() => agent.post('/api/content-operations').set('Idempotency-Key', key).send({ ...input, planHash: preview.body.planHash })));
    expect(responses.map(result => result.status)).toEqual([201, 201]);
    expect(responses[0].body.resultIds).toEqual(responses[1].body.resultIds);
    const id = responses[0].body.resultIds[0];
    expect(responses[0].body.resources).toContainEqual(expect.objectContaining({ type: 'card', id, revision: expect.any(Number), listId: 'l2', dueDateComplete: true }));
    expect(db.prepare('SELECT COUNT(*) FROM content_operations').pluck().get()).toBe(1);
    expect(db.prepare('SELECT COUNT(*) FROM content_operation_effects').pluck().get()).toBe(1);
    expect(db.prepare('SELECT due_date_complete FROM cards WHERE id = ?').pluck().get(id)).toBe(1);
  });

  it('rolls back graph and effect failure without retaining a receipt', async () => {
    const { db, agent } = await setup();
    createAutomationRuleWithConditions(db, 'copy-rule', 'b1', 'Mark copy complete', 'card_created', {}, { listId: null, labelId: null }, 'mark_due_complete', {}, true, null);
    const input = { kind: 'card_copy', sourceId: 'c5', destinationListId: 'l2' };
    const preview = await agent.post('/api/content-operations/preview').send(input);
    const before = db.prepare('SELECT * FROM cards ORDER BY id').all();
    db.exec("CREATE TRIGGER fail_local_effect BEFORE INSERT ON content_operation_effects BEGIN SELECT RAISE(ABORT, 'injected'); END");
    expect((await agent.post('/api/content-operations').set('Idempotency-Key', randomUUID()).send({ ...input, planHash: preview.body.planHash })).status).toBe(500);
    expect(db.prepare('SELECT * FROM cards ORDER BY id').all()).toEqual(before);
    expect(db.prepare('SELECT COUNT(*) FROM content_operations').pluck().get()).toBe(0);
  });

  it('refuses unknown attachment ownership and revoked access without graph changes', async () => {
    const { db, agent } = await setup();
    db.prepare('UPDATE cards SET attachments_json = ? WHERE id = ?').run(JSON.stringify([{ id: 'unsafe', url: 'https://untrusted.example/private', name: 'Reference', type: 'link' }]), 'c5');
    const input = { kind: 'card_copy', sourceId: 'c5', destinationListId: 'l2', keep: { attachments: true } };
    const before = db.prepare('SELECT * FROM cards ORDER BY id').all();
    expect((await agent.post('/api/content-operations/preview').send(input)).body.code).toBe('ATTACHMENT_CONTRACT_UNAVAILABLE');
    expect(db.prepare('SELECT * FROM cards ORDER BY id').all()).toEqual(before);
    const member = request.agent(createApp(db));
    await member.post('/api/auth/login').send({ username: 'priya', password: 'Member12345!' });
    const safe = { ...input, keep: { attachments: false } };
    const preview = await member.post('/api/content-operations/preview').send(safe);
    expect(preview.status).toBe(200);
    db.prepare('DELETE FROM board_memberships WHERE user_id = ? AND board_id = ?').run('u3', 'b1');
    expect((await member.post('/api/content-operations').set('Idempotency-Key', randomUUID()).send({ ...safe, planHash: preview.body.planHash })).status).toBe(404);
    expect(db.prepare('SELECT * FROM cards ORDER BY id').all()).toEqual(before);
  });

  it('creates independent template instances with fresh nested IDs and explicit completion/date retention', async () => {
    const { db, agent } = await setup();
    const date = '2030-01-01T00:00:00.000Z';
    await agent.patch('/api/cards/c5').send({ dueDate: date, dueDateComplete: true, checklists: [{ id: 'source-checklist', title: 'Plan', items: [{ id: 'source-item', text: 'Complete', completed: true }] }] });
    await agent.put('/api/boards/b1/template').send({ isTemplate: true, expectedRevision: 0 });
    const input = { kind: 'board_copy', sourceId: 'b1', destinationWorkspaceId: 'w1', keep: { dueDates: true, dueCompletion: true, checklistCompletion: true } };
    const ids: string[] = [];
    for (let index = 0; index < 2; index++) {
      const preview = await agent.post('/api/content-operations/preview').send(input);
      const result = await agent.post('/api/content-operations').set('Idempotency-Key', randomUUID()).send({ ...input, planHash: preview.body.planHash });
      expect(result.status).toBe(201);
      ids.push(result.body.resultIds[0]);
    }
    const copies = ids.map(id => db.prepare('SELECT id, due_date, due_date_complete, checklists_json FROM cards WHERE board_id = ? AND title = ?').get(id, 'Evaluate state management options') as { id: string; due_date: string; due_date_complete: number; checklists_json: string });
    expect(copies[0].id).not.toBe(copies[1].id);
    const nested = copies.map(copy => JSON.parse(copy.checklists_json));
    expect(nested[0][0].id).not.toBe('source-checklist');
    expect(nested[0][0].id).not.toBe(nested[1][0].id);
    expect(nested[0][0].items[0].id).not.toBe(nested[1][0].items[0].id);
    expect(nested[0][0].items[0].completed).toBe(true);
    expect(copies[0]).toMatchObject({ due_date: date, due_date_complete: 1 });
    await agent.patch(`/api/cards/${copies[0].id}`).send({ title: 'Independent edit' });
    expect(db.prepare('SELECT title FROM cards WHERE id = ?').pluck().get(copies[1].id)).toBe('Evaluate state management options');
    expect(db.prepare('SELECT title FROM cards WHERE id = ?').pluck().get('c5')).toBe('Evaluate state management options');
  });

  it('requires archived state, a fresh impact preview and typed confirmation for permanent deletion', async () => {
    const { db, agent } = await setup();
    const input = { kind: 'delete', resourceType: 'list', sourceId: 'l1' };
    expect((await agent.post('/api/content-operations/preview').send(input)).status).toBe(409);
    await agent.post('/api/lists/l1/archive').send({});
    expect((await agent.delete('/api/lists/l1')).status).toBe(409);
    const preview = await agent.post('/api/content-operations/preview').send(input);
    expect(preview.status).toBe(200);
    expect(preview.body.counts.cards).toBe(2);
    const key = randomUUID();
    const body = { ...input, planHash: preview.body.planHash };
    expect((await agent.post('/api/content-operations').set('Idempotency-Key', key).send(body)).status).toBe(400);
    const response = await agent.post('/api/content-operations').set('Idempotency-Key', key).send({ ...body, confirmation: 'DELETE' });
    expect(response.status).toBe(200);
    expect(response.body.tombstoneId).toBeTruthy();
    expect(db.prepare('SELECT id FROM lists WHERE id = ?').get('l1')).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) FROM cards WHERE list_id = ?').pluck().get('l1')).toBe(0);
    expect(db.prepare('SELECT COUNT(*) FROM users').pluck().get()).toBe(4);
    expect(db.prepare('SELECT COUNT(*) FROM lifecycle_tombstones').pluck().get()).toBe(1);
    await agent.post('/api/auth/login').send({ username: 'admin', password: 'ChangeThisNow123!' });
    const replay = await agent.post('/api/content-operations').set('Idempotency-Key', key).send({ ...body, confirmation: 'DELETE' });
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
  });

  it('rolls back deletion, contexts and tombstones when audit fails', async () => {
    const { db, agent } = await setup();
    await agent.post('/api/boards/b1/close').send({ expectedRevision: 0 });
    const input = { kind: 'delete', resourceType: 'board', sourceId: 'b1' };
    const preview = await agent.post('/api/content-operations/preview').send(input);
    expect(preview.status).toBe(200);
    const before = db.prepare('SELECT * FROM cards ORDER BY id').all();
    db.exec("CREATE TRIGGER fail_delete_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'content.delete' BEGIN SELECT RAISE(ABORT, 'injected'); END");
    const result = await agent.post('/api/content-operations').set('Idempotency-Key', randomUUID()).send({ ...input, planHash: preview.body.planHash, confirmation: 'DELETE' });
    expect(result.status).toBe(500);
    expect(db.prepare('SELECT * FROM cards ORDER BY id').all()).toEqual(before);
    expect(db.prepare('SELECT COUNT(*) FROM lifecycle_tombstones').pluck().get()).toBe(0);
    expect(db.prepare('SELECT COUNT(*) FROM content_operations').pluck().get()).toBe(0);
    expect((await agent.get('/api/workspaces/bootstrap')).status).toBe(200);
  });
  it('requires explicit cross-board maps and moves list descendants without changing identities or archived state', async () => {
    const { db, agent } = await setup();
    db.prepare('UPDATE cards SET archived = 1 WHERE id = ?').run('c6');
    const input = { kind: 'list_move', sourceId: 'l1', destinationBoardId: 'b2', position: 1 };
    const unresolved = await agent.post('/api/content-operations/preview').send(input);
    expect(unresolved.status).toBe(200);
    expect(unresolved.body.unresolvedMappings.length).toBeGreaterThan(0);
    expect((await agent.post('/api/content-operations').set('Idempotency-Key', randomUUID()).send({ ...input, planHash: unresolved.body.planHash })).status).toBe(409);
    const maps = { labelMap: ['lb1', 'lb2', 'lb3'].map(sourceId => ({ sourceId, destinationId: sourceId })), memberMap: ['u1', 'u2', 'u3', 'u4'].map(sourceId => ({ sourceId, destinationId: null })) };
    const mapped = { ...input, ...maps };
    const preview = await agent.post('/api/content-operations/preview').send(mapped);
    expect(preview.status).toBe(200);
    expect(preview.body.unresolvedMappings).toEqual([]);
    const key = randomUUID();
    const response = await agent.post('/api/content-operations').set('Idempotency-Key', key).send({ ...mapped, planHash: preview.body.planHash });
    expect(response.status).toBe(200);
    expect(db.prepare('SELECT board_id, archived FROM cards WHERE id = ?').get('c6')).toEqual({ board_id: 'b2', archived: 1 });
    expect(db.prepare('SELECT board_id, list_id, member_ids_json FROM cards WHERE id = ?').get('c5')).toEqual({ board_id: 'b2', list_id: 'l1', member_ids_json: '[]' });
    const positions = db.prepare('SELECT position FROM lists WHERE board_id = ? AND archived = 0 ORDER BY position').pluck().all('b2');
    expect(positions).toEqual(positions.map((_, index) => index));
    expect((await agent.post('/api/content-operations').set('Idempotency-Key', key).send({ ...mapped, planHash: preview.body.planHash })).body.replayed).toBe(true);
  });

  it('transfers board authority atomically, detaches source collections and invalidates affected sessions', async () => {
    const { db, agent } = await setup();
    db.prepare('INSERT INTO board_collections (id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)').run('collection', 'w1', 'Source', new Date().toISOString());
    db.prepare('INSERT INTO board_collection_items VALUES (?, ?)').run('collection', 'b1');
    db.prepare('UPDATE users SET default_workspace_id = ?, default_board_id = ? WHERE id = ?').run('w1', 'b1', 'u2');
    const input = { kind: 'board_move', sourceId: 'b1', destinationWorkspaceId: 'w2' };
    const preview = await agent.post('/api/content-operations/preview').send(input);
    expect(preview.status).toBe(200);
    expect(preview.body.audience).toBeDefined();
    const explicit = db.prepare('SELECT * FROM board_admin_grants WHERE board_id = ? ORDER BY id').all('b1');
    const members = db.prepare('SELECT * FROM board_memberships WHERE board_id = ? ORDER BY id').all('b1');
    const response = await agent.post('/api/content-operations').set('Idempotency-Key', randomUUID()).send({ ...input, planHash: preview.body.planHash });
    expect(response.status).toBe(200);
    expect(db.prepare('SELECT workspace_id FROM boards WHERE id = ?').pluck().get('b1')).toBe('w2');
    expect(db.prepare('SELECT * FROM board_admin_grants WHERE board_id = ? ORDER BY id').all('b1')).toEqual(explicit);
    expect(db.prepare('SELECT * FROM board_memberships WHERE board_id = ? ORDER BY id').all('b1')).toEqual(members);
    expect(db.prepare('SELECT COUNT(*) FROM board_collection_items WHERE board_id = ?').pluck().get('b1')).toBe(0);
    expect(db.prepare('SELECT default_board_id FROM users WHERE id = ?').pluck().get('u2')).toBeNull();
    const alex = request.agent(createApp(db));
    await alex.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' });
    const state = await alex.get('/api/workspaces/bootstrap');
    expect(state.body.appState.boards.some((board: { id: string }) => board.id === 'b1')).toBe(false);
  });
  it('previews without writes, creates independent boards with safe defaults, and replays only the same request', async () => {
    const { db, agent } = await setup();
    const input = { kind: 'board_copy', sourceId: 'b1', destinationWorkspaceId: 'w1', title: 'Independent' };
    const before = db.prepare('SELECT * FROM boards ORDER BY id').all();
    const audits = db.prepare('SELECT COUNT(*) FROM audit_events').pluck().get();
    const preview = await agent.post('/api/content-operations/preview').send(input);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ unresolvedMappings: [], counts: { boards: 1 } });
    expect(db.prepare('SELECT * FROM boards ORDER BY id').all()).toEqual(before);
    expect(db.prepare('SELECT COUNT(*) FROM audit_events').pluck().get()).toBe(audits);
    expect(db.prepare('SELECT COUNT(*) FROM content_operations').pluck().get()).toBe(0);
    const key = randomUUID();
    const body = { ...input, planHash: preview.body.planHash };
    const result = await agent.post('/api/content-operations').set('Idempotency-Key', key).send(body);
    expect(result.status).toBe(201);
    const boardId = result.body.resultIds[0];
    expect(boardId).not.toBe('b1');
    expect(db.prepare('SELECT starred, is_template FROM boards WHERE id = ?').get(boardId)).toEqual({ starred: 0, is_template: 0 });
    expect(db.prepare('SELECT COUNT(*) FROM board_memberships WHERE board_id = ?').pluck().get(boardId)).toBe(0);
    expect(db.prepare('SELECT COUNT(*) FROM board_admin_grants WHERE board_id = ? AND user_id = ?').pluck().get(boardId, 'u1')).toBe(1);
    const cards = db.prepare('SELECT * FROM cards WHERE board_id = ?').all(boardId) as Record<string, unknown>[];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card).toMatchObject({ due_date: null, due_date_complete: 0, member_ids_json: '[]', comments_json: '[]', watching: 0, attachments_json: '[]' });
      expect(db.prepare('SELECT 1 FROM cards WHERE board_id = ? AND id = ?').get('b1', card.id)).toBeUndefined();
    }
    const replay = await agent.post('/api/content-operations').set('Idempotency-Key', key).send(body);
    expect(replay.status).toBe(201);
    expect(replay.body).toMatchObject({ ...result.body, replayed: true });
    expect((await agent.post('/api/content-operations').set('Idempotency-Key', key).send({ ...body, title: 'Changed' })).status).toBe(409);
    expect(db.prepare('SELECT COUNT(*) FROM content_operations').pluck().get()).toBe(1);
    const next = await agent.post('/api/content-operations/preview').send(input);
    const second = await agent.post('/api/content-operations').set('Idempotency-Key', randomUUID()).send({ ...input, planHash: next.body.planHash });
    expect(second.status).toBe(201);
    expect(second.body.resultIds[0]).not.toBe(boardId);
  });

  it('rejects stale previews and rolls back the entire copied graph if its audit fails', async () => {
    const { db, agent } = await setup();
    const input = { kind: 'board_copy', sourceId: 'b1', destinationWorkspaceId: 'w1', title: 'Atomic' };
    const preview = await agent.post('/api/content-operations/preview').send(input);
    expect(preview.status).toBe(200);
    await agent.patch('/api/cards/c1').send({ title: 'Changed child' });
    expect((await agent.post('/api/content-operations').set('Idempotency-Key', randomUUID()).send({ ...input, planHash: preview.body.planHash })).status).toBe(409);
    const fresh = await agent.post('/api/content-operations/preview').send(input);
    const before = db.prepare('SELECT * FROM boards ORDER BY id').all();
    db.exec("CREATE TRIGGER fail_content_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'content.copy' BEGIN SELECT RAISE(ABORT, 'injected'); END");
    expect((await agent.post('/api/content-operations').set('Idempotency-Key', randomUUID()).send({ ...input, planHash: fresh.body.planHash })).status).toBe(500);
    expect(db.prepare('SELECT * FROM boards ORDER BY id').all()).toEqual(before);
    expect(db.prepare('SELECT COUNT(*) FROM content_operations').pluck().get()).toBe(0);
    expect(db.prepare('SELECT COUNT(*) FROM content_operation_effects').pluck().get()).toBe(0);
  });
});
