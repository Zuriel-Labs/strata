// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../src/db/database';
import { createApp } from '../src/app';
import { closeDatabase } from '../src/db/database';
import { createAutomationRuleWithConditions, createNotification, createSession, getAutomationRuleById, getCardById, getRecoveryKeyByUserId, getSession, getUserById, listAuditEvents, updateCard, upsertPasswordReset, upsertRecoveryKey } from '../src/db/repositories';
import { deleteManagedUser } from '../src/db/admin-repositories';
import { DISABLED_PASSWORD_HASH } from '../src/auth/passwords';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
});

async function loginAsAdmin(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'ChangeMe123!' });
  await agent.post('/api/auth/password/change').send({ currentPassword: 'ChangeMe123!', nextPassword: 'ChangeThisNow123!', confirmPassword: 'ChangeThisNow123!' });
  return agent;
}

describe('admin routes', () => {
  afterEach(() => {
    closeDatabase();
  });

  it('creates a managed user with invite token and generates a recovery key', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAsAdmin(app);

    const createResponse = await agent.post('/api/admin/users').send({
      name: 'Jordan Lee',
      initials: 'JL',
      color: '#2563eb',
      username: 'jordan',
      platformRole: 'user',
      active: true,
      workspaceMemberships: [{ workspaceId: 'w1', role: 'member' }],
      boardMemberships: [{ boardId: 'b1', role: 'observer' }],
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.inviteToken).toBeTruthy();
    expect(createResponse.body.inviteToken).toHaveLength(64);
    expect(getUserById(db, createResponse.body.user.id)?.passwordHash).toBe(DISABLED_PASSWORD_HASH);
    expect(getRecoveryKeyByUserId(db, createResponse.body.user.id)?.keyHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const loginBeforeActivation = await request(app).post('/api/auth/login').send({ username: 'jordan', password: 'anything-at-all' });
    expect(loginBeforeActivation.status).toBe(401);

    // The invite token acts as the user's first recovery key —
    // consuming it via the recovery flow should work and return a new key
    const consumeResponse = await request(app).post('/api/auth/recovery-key/consume').send({
      username: 'jordan',
      recoveryKey: createResponse.body.inviteToken,
      newPassword: 'MyNewSecurePass1!',
      confirmPassword: 'MyNewSecurePass1!',
    });
    expect(consumeResponse.status).toBe(200);
    expect(consumeResponse.body.newRecoveryKey).toBeTruthy();
    expect(consumeResponse.body.newRecoveryKey).toHaveLength(64);

    // Admin can still generate a new recovery key for the user
    const recoveryResponse = await agent.post(`/api/admin/users/${createResponse.body.user.id}/generate-recovery-key`);
    expect(recoveryResponse.status).toBe(200);
    expect(recoveryResponse.body.recoveryKey).toBeTruthy();
    expect(recoveryResponse.body.recoveryKey).toHaveLength(64);
  });

  it('bounds the recent audit query in SQLite before building the admin response', async () => {
    const db = await createDatabase(':memory:');
    const insert = db.prepare(`
      INSERT INTO audit_events (id, actor_user_id, target_user_id, scope_type, scope_id, action, outcome, metadata_json, created_at)
      VALUES (?, NULL, NULL, 'platform', NULL, ?, 'success', '{}', ?)
    `);
    for (let index = 0; index < 30; index += 1) {
      insert.run(`audit-limit-${index}`, `limit-test-${index}`, `2027-01-01T00:${String(index).padStart(2, '0')}:00.000Z`);
    }

    const recent = listAuditEvents(db, 25);
    expect(recent).toHaveLength(25);
    expect(recent[0]?.action).toBe('limit-test-29');
    expect(recent.at(-1)?.action).toBe('limit-test-5');
    expect((db.prepare('SELECT COUNT(*) AS count FROM audit_events').get() as { count: number }).count).toBeGreaterThan(25);
    const queryPlan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?').all(25) as Array<{ detail: string }>;
    expect(queryPlan.some(row => row.detail.includes('idx_audit_events_created_at'))).toBe(true);

    const app = createApp(db);
    const agent = await loginAsAdmin(app);
    const response = await agent.get('/api/admin/users');
    expect(response.status).toBe(200);
    expect(response.body.auditEvents).toHaveLength(25);
    expect(response.body.auditEvents[0].action).toBe('limit-test-29');
  });

  it('deletes a managed user and scrubs live references while preserving history', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAsAdmin(app);

    const createResponse = await agent.post('/api/admin/users').send({
      name: 'Jordan Lee',
      initials: 'JL',
      color: '#2563eb',
      username: 'jordan',
      platformRole: 'user',
      active: true,
      workspaceMemberships: [{ workspaceId: 'w1', role: 'member' }],
      boardMemberships: [{ boardId: 'b1', role: 'observer' }],
    });

    expect(createResponse.status).toBe(201);
    const deletedUserId = createResponse.body.user.id as string;

    const targetSession = createSession(db, deletedUserId);
    upsertRecoveryKey(db, deletedUserId, 'recovery-hash');
    upsertPasswordReset(db, deletedUserId, 'u1', 'temporary-hash');
    createNotification(db, 'n-delete-user', deletedUserId, 'c1', 'b1', 'Please review this card');

    const card = getCardById(db, 'c1');
    expect(card).not.toBeNull();
    updateCard(db, 'c1', {
      memberIds: [...(card?.memberIds ?? []), deletedUserId],
      comments: [...(card?.comments ?? []), { id: 'cm-delete-user', userId: deletedUserId, text: 'Keep this comment', createdAt: new Date().toISOString() }],
      activity: [...(card?.activity ?? []), { id: 'ac-delete-user', userId: deletedUserId, action: 'added this note', createdAt: new Date().toISOString() }],
    });

    createAutomationRuleWithConditions(
      db,
      'rule-delete-user',
      'b1',
      'Assign Jordan',
      'card_created',
      {},
      { listId: null, labelId: null },
      'assign_member',
      { memberId: deletedUserId },
      true,
      null,
    );

    const deleteResponse = await agent.delete(`/api/admin/users/${deletedUserId}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toMatchObject({
      deletedUserId,
      username: 'jordan',
      remediatedAutomationRules: 1,
    });
    expect(deleteResponse.body.removedCardAssignments).toBeGreaterThanOrEqual(1);
    expect(getUserById(db, deletedUserId)).toBeNull();
    expect(getSession(db, targetSession.id)).toBeNull();
    expect(getRecoveryKeyByUserId(db, deletedUserId)).toBeNull();
    expect(db.prepare('SELECT * FROM password_resets WHERE user_id = ?').get(deletedUserId)).toBeUndefined();
    expect(db.prepare('SELECT * FROM notifications WHERE user_id = ?').get(deletedUserId)).toBeUndefined();

    const updatedCard = getCardById(db, 'c1');
    expect(updatedCard?.memberIds).not.toContain(deletedUserId);
    expect(updatedCard?.comments.some(comment => comment.userId === deletedUserId)).toBe(true);
    expect(updatedCard?.activity.some(entry => entry.userId === deletedUserId)).toBe(true);

    const updatedRule = getAutomationRuleById(db, 'rule-delete-user');
    expect(updatedRule?.enabled).toBe(false);
    expect(updatedRule?.actionConfig.memberId).toBeUndefined();

    const deleteAudit = db.prepare("SELECT metadata_json FROM audit_events WHERE action = 'user.delete' ORDER BY created_at DESC LIMIT 1").get() as { metadata_json: string } | undefined;
    expect(deleteAudit).toBeDefined();
    expect(JSON.parse(deleteAudit?.metadata_json ?? '{}')).toMatchObject({
      username: 'jordan',
      remediatedAutomationRules: 1,
    });
  });

  it('rejects self-delete through the admin route', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);
    const agent = await loginAsAdmin(app);

    const response = await agent.delete('/api/admin/users/u1');

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Cannot delete the currently authenticated user.');
    expect(getUserById(db, 'u1')).not.toBeNull();
  });

  it('rejects deleting the last remaining system administrator in repository safeguards', async () => {
    const db = await createDatabase(':memory:');
    const onlyAdmin = getUserById(db, 'u1');
    expect(onlyAdmin).not.toBeNull();

    expect(() => deleteManagedUser(db, { ...onlyAdmin!, id: 'external-admin' }, 'u1')).toThrow('Cannot delete the last remaining system administrator.');
    expect(getUserById(db, 'u1')).not.toBeNull();
  });
});
