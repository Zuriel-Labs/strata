// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/database';
import { countSystemAdmins, getUserByUsername } from '../src/db/repositories';
import { closeDatabase } from '../src/db/database';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
});

describe('backend foundation', () => {
  afterEach(() => {
    closeDatabase();
  });

  it('seeds the bootstrap system administrator', async () => {
    const db = await createDatabase(':memory:');
    const admin = getUserByUsername(db, 'admin');

    expect(admin).not.toBeNull();
    expect(admin?.platformRole).toBe('system_admin');
    expect(countSystemAdmins(db)).toBeGreaterThanOrEqual(1);
  });
});
