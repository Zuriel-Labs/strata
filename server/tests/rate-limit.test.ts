// @vitest-environment node

import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase, closeDatabase } from '../src/db/database';
import { createApp } from '../src/app';

// Explicitly ENABLE rate limiting for these tests (default test mode disables it)
let originalRateLimitDisabled: string | undefined;

beforeAll(() => {
  process.env.SEED_DATA = 'true';
  originalRateLimitDisabled = process.env.STRATA_RATE_LIMIT_DISABLED;
  // Enable rate limiting enforcement for these tests
  process.env.STRATA_RATE_LIMIT_DISABLED = 'false';
});

afterAll(() => {
  // Restore original setting
  if (originalRateLimitDisabled !== undefined) {
    process.env.STRATA_RATE_LIMIT_DISABLED = originalRateLimitDisabled;
  } else {
    delete process.env.STRATA_RATE_LIMIT_DISABLED;
  }
});

describe('rate limiting', () => {
  afterEach(() => {
    closeDatabase();
  });

  it('rate limits login attempts to 5 per minute per IP', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);

    // Make 5 failed login attempts
    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrong-password' });
      expect(response.status).toBe(401);
    }

    // 6th attempt should be rate limited
    const rateLimited = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong-password' });
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.body.message).toContain('Too many requests');
  });

  it('rate limits bootstrap attempts to 3 per minute per IP', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);

    // Make 3 bootstrap attempts (they'll fail validation but count toward rate limit)
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/auth/bootstrap')
        .send({ username: 'test', password: 'short', confirmPassword: 'short' });
    }

    // 4th attempt should be rate limited
    const rateLimited = await request(app)
      .post('/api/auth/bootstrap')
      .send({ username: 'test', password: 'ValidPassword123!', confirmPassword: 'ValidPassword123!' });
    expect(rateLimited.status).toBe(429);
  });

  it('rate limits recovery key consume to 3 per minute per IP', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);

    // Make 3 recovery key consume attempts
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/auth/recovery-key/consume')
        .send({ username: 'admin', recoveryKey: 'invalid-key', newPassword: 'NewPassword123!', confirmPassword: 'NewPassword123!' });
    }

    // 4th attempt should be rate limited
    const rateLimited = await request(app)
      .post('/api/auth/recovery-key/consume')
      .send({ username: 'admin', recoveryKey: 'another-key', newPassword: 'NewPassword123!', confirmPassword: 'NewPassword123!' });
    expect(rateLimited.status).toBe(429);
  });

  it('includes RateLimit headers in 429 response', async () => {
    const db = await createDatabase(':memory:');
    const app = createApp(db);

    // Exhaust login limit
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrong' });
    }

    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' });

    expect(response.status).toBe(429);
    // express-rate-limit sets Retry-After header
    expect(response.headers['retry-after']).toBeDefined();
  });
});