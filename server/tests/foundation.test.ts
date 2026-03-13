// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/database';
import { countSystemAdmins, getUserByEmail } from '../src/db/repositories';
import { closeDatabase } from '../src/db/database';

describe('backend foundation', () => {
  afterEach(() => {
    closeDatabase();
  });

  it('seeds the bootstrap system administrator', async () => {
    const db = await createDatabase(':memory:');
    const admin = getUserByEmail(db, 'admin@strata.local');

    expect(admin).not.toBeNull();
    expect(admin?.platformRole).toBe('system_admin');
    expect(countSystemAdmins(db)).toBeGreaterThanOrEqual(1);
  });
});
