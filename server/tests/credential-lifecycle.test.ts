// @vitest-environment node

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createDatabase, type DatabaseHandle } from '../src/db/database';
import { createApp } from '../src/app';
import { getRecoveryKeyByUserId, getUserById, upsertRecoveryKey } from '../src/db/repositories';
import { hashPassword } from '../src/auth/passwords';
import * as passwords from '../src/auth/passwords';
import { verifyRecoveryKey } from '../src/auth/recovery-keys';

beforeAll(() => { process.env.SEED_DATA = 'true'; });

describe('credential lifecycle', () => {
  let db: DatabaseHandle;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = await createDatabase(':memory:');
    app = createApp(db);
  });

  afterEach(() => { vi.restoreAllMocks(); db.close(); });

  async function signIn() {
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' })).status).toBe(200);
    return agent;
  }

  it('revokes every old session after recovery without signing the caller in', async () => {
    const first = await signIn();
    const second = await signIn();
    const generated = await first.post('/api/auth/recovery-key/generate');
    expect(generated.status).toBe(200);

    const recovered = await request(app).post('/api/auth/recovery-key/consume').send({
      username: 'alex', recoveryKey: generated.body.recoveryKey,
      newPassword: 'RecoveredPassword123!', confirmPassword: 'RecoveredPassword123!',
    });

    expect(recovered.status).toBe(200);
    expect(recovered.body.newRecoveryKey).toMatch(/^[a-f0-9]{64}$/);
    expect(recovered.headers['set-cookie']).toBeUndefined();
    expect((await first.get('/api/auth/session')).status).toBe(401);
    expect((await second.get('/api/auth/session')).status).toBe(401);
    expect(db.prepare('SELECT id FROM sessions WHERE user_id = ?').all('u2')).toEqual([]);
  });

  it('allows exactly one concurrent recovery and rejects replay with the same safe error', async () => {
    const agent = await signIn();
    const generated = await agent.post('/api/auth/recovery-key/generate');
    const payload = {
      username: 'alex', recoveryKey: generated.body.recoveryKey,
      newPassword: 'RecoveredPassword123!', confirmPassword: 'RecoveredPassword123!',
    };
    const passwordsToTry = ['RecoveredPassword123!', 'OtherRecoveredPassword123!'];
    const results = await Promise.all([
      request(app).post('/api/auth/recovery-key/consume').send(payload),
      request(app).post('/api/auth/recovery-key/consume').send({ ...payload, newPassword: passwordsToTry[1], confirmPassword: passwordsToTry[1] }),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([200, 401]);
    expect(results.find(result => result.status === 401)?.body).toEqual({ code: 'RECOVERY_INVALID', message: 'Invalid recovery request.' });
    const replay = await request(app).post('/api/auth/recovery-key/consume').send(payload);
    expect(replay.status).toBe(401);
    expect(replay.body).toEqual({ code: 'RECOVERY_INVALID', message: 'Invalid recovery request.' });
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'auth.recovery_consume' AND outcome = 'success'").all()).toHaveLength(1);
    for (const [index, password] of passwordsToTry.entries()) {
      const login = await request(app).post('/api/auth/login').send({ username: 'alex', password });
      expect(login.status).toBe(results[index].status === 200 ? 200 : 401);
    }
    const winner = results.find(result => result.status === 200);
    const replacement = getRecoveryKeyByUserId(db, 'u2');
    if (!winner || !replacement) throw new Error('Expected the winning recovery to install a key.');
    expect(await verifyRecoveryKey(winner.body.newRecoveryKey, replacement.keyHash)).toBe(true);
    const auditRows = JSON.stringify(db.prepare("SELECT * FROM audit_events WHERE action = 'auth.recovery_consume'").all());
    expect(auditRows.includes(payload.recoveryKey)).toBe(false);
    expect(auditRows.includes(winner.body.newRecoveryKey)).toBe(false);
  });

  it('rolls back credentials, replacement key and sessions if recovery audit fails', async () => {
    const agent = await signIn();
    const generated = await agent.post('/api/auth/recovery-key/generate');
    const userBefore = getUserById(db, 'u2');
    const keyBefore = getRecoveryKeyByUserId(db, 'u2');
    const sessionsBefore = db.prepare('SELECT id FROM sessions WHERE user_id = ?').all('u2');
    db.prepare('INSERT INTO password_resets (user_id, temporary_password_hash, issued_by_user_id, issued_at, consumed_at) VALUES (?, ?, ?, ?, NULL)')
      .run('u2', userBefore?.passwordHash, 'u1', new Date().toISOString());
    const resetBefore = db.prepare('SELECT * FROM password_resets WHERE user_id = ?').get('u2');
    db.exec(`CREATE TRIGGER fail_recovery_audit BEFORE INSERT ON audit_events
      WHEN NEW.action = 'auth.recovery_consume' AND NEW.outcome = 'success'
      BEGIN SELECT RAISE(ABORT, 'Synthetic recovery audit failure'); END;`);

    const result = await request(app).post('/api/auth/recovery-key/consume').send({
      username: 'alex', recoveryKey: generated.body.recoveryKey,
      newPassword: 'RecoveredPassword123!', confirmPassword: 'RecoveredPassword123!',
    });

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ message: 'Password reset failed.' });
    expect(getUserById(db, 'u2')).toEqual(userBefore);
    expect(getRecoveryKeyByUserId(db, 'u2')).toEqual(keyBefore);
    expect(db.prepare('SELECT id FROM sessions WHERE user_id = ?').all('u2')).toEqual(sessionsBefore);
    expect(db.prepare('SELECT * FROM password_resets WHERE user_id = ?').get('u2')).toEqual(resetBefore);
    expect((await agent.get('/api/auth/session')).status).toBe(200);
  });

  it.each(['missing user', 'missing key', 'wrong key', 'inactive account'])('uses a safe rejection without credential changes for %s', async scenario => {
    const agent = await signIn();
    const generated = await agent.post('/api/auth/recovery-key/generate');
    if (scenario === 'missing key') db.prepare('DELETE FROM recovery_keys WHERE user_id = ?').run('u2');
    if (scenario === 'inactive account') db.prepare('UPDATE users SET active = 0 WHERE id = ?').run('u2');
    const before = getUserById(db, 'u2');
    const keyBefore = getRecoveryKeyByUserId(db, 'u2');
    const result = await request(app).post('/api/auth/recovery-key/consume').send({
      username: scenario === 'missing user' ? 'missing' : 'alex',
      recoveryKey: scenario === 'wrong key' ? 'incorrect' : generated.body.recoveryKey,
      newPassword: 'RecoveredPassword123!', confirmPassword: 'RecoveredPassword123!',
    });
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ code: 'RECOVERY_INVALID', message: 'Invalid recovery request.' });
    expect(getUserById(db, 'u2')).toEqual(before);
    expect(getRecoveryKeyByUserId(db, 'u2')).toEqual(keyBefore);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'auth.recovery_consume' AND outcome = 'success'").all()).toEqual([]);
  });

  it('preserves legacy bcrypt recovery and leaves other users signed in', async () => {
    const other = request.agent(app);
    await other.post('/api/auth/login').send({ username: 'priya', password: 'Member12345!' });
    upsertRecoveryKey(db, 'u2', await hashPassword('LegacyRecoveryKey123!'));
    const result = await request(app).post('/api/auth/recovery-key/consume').send({
      username: 'alex', recoveryKey: 'LegacyRecoveryKey123!',
      newPassword: 'RecoveredPassword123!', confirmPassword: 'RecoveredPassword123!',
    });
    expect(result.status).toBe(200);
    expect((await other.get('/api/auth/session')).status).toBe(200);
    const login = await request(app).post('/api/auth/login').send({ username: 'alex', password: 'RecoveredPassword123!' });
    expect(login.status).toBe(200);
  });

  it('rotates the current session and revokes other sessions after password change', async () => {
    const agent = await signIn();
    const other = await signIn();
    const oldSessions = db.prepare('SELECT id FROM sessions WHERE user_id = ?').all('u2');
    const changed = await agent.post('/api/auth/password/change').send({
      currentPassword: 'WorkspaceAdmin123!', nextPassword: 'ChangedPassword123!', confirmPassword: 'ChangedPassword123!',
    });
    expect(changed.status).toBe(204);
    expect(changed.headers['set-cookie']).toBeDefined();
    expect(db.prepare('SELECT id FROM sessions WHERE user_id = ?').all('u2')).toHaveLength(1);
    for (const session of oldSessions) expect(db.prepare('SELECT id FROM sessions WHERE id = ?').get((session as { id: string }).id)).toBeUndefined();
    expect((await agent.get('/api/auth/session')).status).toBe(200);
    expect((await other.get('/api/auth/session')).status).toBe(401);
  });

  it('rolls back password and sessions without setting a cookie when password-change audit fails', async () => {
    const agent = await signIn();
    const before = getUserById(db, 'u2');
    const sessions = db.prepare('SELECT id FROM sessions WHERE user_id = ?').all('u2');
    db.exec(`CREATE TRIGGER fail_password_audit BEFORE INSERT ON audit_events
      WHEN NEW.action = 'auth.password_change' AND NEW.outcome = 'success'
      BEGIN SELECT RAISE(ABORT, 'Synthetic password audit failure'); END;`);
    const changed = await agent.post('/api/auth/password/change').send({
      currentPassword: 'WorkspaceAdmin123!', nextPassword: 'ChangedPassword123!', confirmPassword: 'ChangedPassword123!',
    });
    expect(changed.status).toBe(500);
    expect(changed.body).toEqual({ message: 'Password update failed.' });
    expect(changed.headers['set-cookie']).toBeUndefined();
    expect(getUserById(db, 'u2')).toEqual(before);
    expect(db.prepare('SELECT id FROM sessions WHERE user_id = ?').all('u2')).toEqual(sessions);
    expect((await agent.get('/api/auth/session')).status).toBe(200);
  });

  it.each(['session revoked', 'account disabled', 'password replaced'])('rejects password change if %s during hashing', async scenario => {
    const agent = await signIn();
    const realHash = passwords.hashPassword;
    const replacement = await realHash('ReplacementPassword123!');
    let release!: () => void;
    let started!: () => void;
    const resumed = new Promise<void>(resolve => { release = resolve; });
    const hashing = new Promise<void>(resolve => { started = resolve; });
    vi.spyOn(passwords, 'hashPassword').mockImplementationOnce(async value => {
      started();
      await resumed;
      return realHash(value);
    });
    const pending = agent.post('/api/auth/password/change').send({
      currentPassword: 'WorkspaceAdmin123!', nextPassword: 'ChangedPassword123!', confirmPassword: 'ChangedPassword123!',
    }).then(result => result);
    await hashing;
    if (scenario === 'session revoked') db.prepare('DELETE FROM sessions WHERE user_id = ?').run('u2');
    if (scenario === 'account disabled') db.prepare('UPDATE users SET active = 0 WHERE id = ?').run('u2');
    if (scenario === 'password replaced') db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(replacement, 'u2');
    const before = getUserById(db, 'u2');
    release();
    const result = await pending;
    expect(result.status).toBe(401);
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(getUserById(db, 'u2')).toEqual(before);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'auth.password_change' AND outcome = 'success'").all()).toEqual([]);
  });

  it('cannot start a session using credentials replaced during login verification', async () => {
    const replacement = await hashPassword('ReplacementPassword123!');
    const realVerify = passwords.verifyPassword;
    let release!: () => void;
    let started!: () => void;
    const resumed = new Promise<void>(resolve => { release = resolve; });
    const verifying = new Promise<void>(resolve => { started = resolve; });
    vi.spyOn(passwords, 'verifyPassword').mockImplementationOnce(async (value, hash) => {
      const valid = await realVerify(value, hash);
      started();
      await resumed;
      return valid;
    });
    const pending = request(app).post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' }).then(result => result);
    await verifying;
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(replacement, 'u2');
    release();
    const result = await pending;
    expect(result.status).toBe(401);
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(db.prepare('SELECT id FROM sessions WHERE user_id = ?').all('u2')).toEqual([]);
  });

  it.each(['auth.login', 'auth.logout', 'auth.recovery_key_generate'])('rolls back %s when its audit fails', async action => {
    const agent = await signIn();
    const generated = await agent.post('/api/auth/recovery-key/generate');
    expect(generated.status).toBe(200);
    const keyBefore = getRecoveryKeyByUserId(db, 'u2');
    const sessions = db.prepare('SELECT id FROM sessions WHERE user_id = ?').all('u2');
    db.exec(`CREATE TRIGGER fail_lifecycle_audit BEFORE INSERT ON audit_events
      WHEN NEW.action = '${action}' AND NEW.outcome = 'success'
      BEGIN SELECT RAISE(ABORT, 'Synthetic lifecycle audit failure'); END;`);
    const result = action === 'auth.login'
      ? await request(app).post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' })
      : await agent.post(action === 'auth.logout' ? '/api/auth/logout' : '/api/auth/recovery-key/generate');
    expect(result.status).toBe(500);
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(db.prepare('SELECT id FROM sessions WHERE user_id = ?').all('u2')).toEqual(sessions);
    expect(getRecoveryKeyByUserId(db, 'u2')).toEqual(keyBefore);
  });

  it.each([
    { name: 'wrong current password', body: { currentPassword: 'Incorrect123!', nextPassword: 'ChangedPassword123!', confirmPassword: 'ChangedPassword123!' }, status: 401 },
    { name: 'short password', body: { currentPassword: 'WorkspaceAdmin123!', nextPassword: 'short', confirmPassword: 'short' }, status: 400 },
    { name: 'mismatched confirmation', body: { currentPassword: 'WorkspaceAdmin123!', nextPassword: 'ChangedPassword123!', confirmPassword: 'DifferentPassword123!' }, status: 400 },
    { name: 'invalid payload', body: {}, status: 400 },
  ])('preserves credentials and sessions for $name', async ({ body, status }) => {
    const agent = await signIn();
    const before = getUserById(db, 'u2');
    const sessions = db.prepare('SELECT id FROM sessions WHERE user_id = ?').all('u2');
    const result = await agent.post('/api/auth/password/change').send(body);
    expect(result.status).toBe(status);
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(getUserById(db, 'u2')).toEqual(before);
    expect(db.prepare('SELECT id FROM sessions WHERE user_id = ?').all('u2')).toEqual(sessions);
    expect(db.prepare("SELECT id FROM audit_events WHERE action = 'auth.password_change' AND outcome = 'success'").all()).toEqual([]);
  });
});
