// @vitest-environment node

import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase, closeDatabase } from '../src/db/database';
import { createApp } from '../src/app';

// Explicitly ENABLE CSRF for these tests (default test mode disables it)
let originalCsrfDisabled: string | undefined;

beforeAll(() => {
  process.env.SEED_DATA = 'true';
  originalCsrfDisabled = process.env.STRATA_CSRF_DISABLED;
  // Enable CSRF enforcement for these tests
  process.env.STRATA_CSRF_DISABLED = 'false';
});

afterAll(() => {
  // Restore original setting
  if (originalCsrfDisabled !== undefined) {
    process.env.STRATA_CSRF_DISABLED = originalCsrfDisabled;
  } else {
    delete process.env.STRATA_CSRF_DISABLED;
  }
});

describe('CSRF protection', () => {
  afterEach(() => {
    closeDatabase();
  });

  it('returns CSRF token from /api/auth/csrf-token', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);

    const response = await request(app)
      .get('/api/auth/csrf-token');

    expect(response.status).toBe(200);
    expect(response.body.csrfToken).toBeDefined();
    expect(typeof response.body.csrfToken).toBe('string');
    expect(response.body.csrfToken.length).toBeGreaterThan(0);
    // Cookie should be set
    const setCookie = response.headers['set-cookie'];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie ?? '');
    expect(cookieStr).toContain('strata_csrf=');
  });

  it('rejects mutating requests without CSRF token', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);

    const agent = request.agent(app);

    // Login first (CSRF-exempt)
    await agent.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' });

    // Try a PATCH without CSRF token
    const response = await agent
      .patch('/api/auth/profile')
      .send({ name: 'Hacked', initials: 'HK', color: '#ff0000' });

    expect(response.status).toBe(403);
    expect(response.body.message).toContain('CSRF');
  });

  it('rejects mutating requests with mismatched CSRF token', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);

    const agent = request.agent(app);

    // Get a valid CSRF token (which sets the cookie)
    await agent.get('/api/auth/csrf-token');

    // Login (CSRF-exempt)
    await agent.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' });

    // Try with a mismatched token (cookie has valid token, header has wrong one)
    const response = await agent
      .patch('/api/auth/profile')
      .set('X-CSRF-Token', 'wrong-token-value')
      .send({ name: 'Hacked', initials: 'HK', color: '#ff0000' });

    expect(response.status).toBe(403);
    expect(response.body.message).toContain('CSRF');
  });

  it('allows mutating requests with valid CSRF token', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);

    const agent = request.agent(app);

    // Get CSRF token
    const csrfResponse = await agent.get('/api/auth/csrf-token');
    const token = csrfResponse.body.csrfToken;

    // Login (CSRF-exempt)
    await agent.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' });

    // Mutating request WITH valid CSRF token
    const response = await agent
      .patch('/api/auth/profile')
      .set('X-CSRF-Token', token)
      .send({ name: 'Alex Updated', initials: 'AU', color: '#315ddc' });

    expect(response.status).toBe(200);
    expect(response.body.user.name).toBe('Alex Updated');
  });

  it('allows login without CSRF token (CSRF-exempt)', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);

    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alex', password: 'WorkspaceAdmin123!' });

    expect(response.status).toBe(200);
  });

  it('allows recovery key consume without CSRF token (CSRF-exempt)', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);

    const agent = request.agent(app);

    // Login (CSRF-exempt)
    const loginResponse = await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'ChangeMe123!' });
    expect(loginResponse.status).toBe(200);

    // Get CSRF token for authenticated mutating requests
    const csrfResponse = await agent.get('/api/auth/csrf-token');
    const token = csrfResponse.body.csrfToken;

    // Handle password change required
    await agent
      .post('/api/auth/password/change')
      .set('X-CSRF-Token', token)
      .send({ currentPassword: 'ChangeMe123!', nextPassword: 'ChangedPassword123!', confirmPassword: 'ChangedPassword123!' });

    // Generate recovery key (needs CSRF)
    const genResponse = await agent
      .post('/api/auth/recovery-key/generate')
      .set('X-CSRF-Token', token);
    expect(genResponse.status).toBe(200);
    const recoveryKey = genResponse.body.recoveryKey;

    // Consume recovery key WITHOUT CSRF token — should work (CSRF-exempt)
    const consumeResponse = await request(app)
      .post('/api/auth/recovery-key/consume')
      .send({ username: 'admin', recoveryKey, newPassword: 'RecoveredPassword123!', confirmPassword: 'RecoveredPassword123!' });

    expect(consumeResponse.status).toBe(200);
    expect(consumeResponse.body.newRecoveryKey).toBeDefined();
  });

  it('allows GET requests without CSRF token', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);

    const response = await request(app)
      .get('/api/auth/needs-bootstrap');

    expect(response.status).toBe(200);
  });
});