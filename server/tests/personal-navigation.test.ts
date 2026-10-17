// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from '../src/db/database';
import { createSchema } from '../src/db/schema';

describe('personal navigation', () => {
  let db: DatabaseHandle;
  beforeEach(async () => { process.env.SEED_DATA = 'true'; db = await createDatabase(':memory:'); });
  afterEach(() => db.close());

  it('migrates twice without copying shared stars or changing existing records', () => {
    // Finish the existing legacy card-membership migration before modeling a prior database.
    createSchema(db);
    db.exec('DROP TABLE user_board_navigation');
    const tables = ['users', 'boards', 'board_memberships', 'workspace_admin_grants', 'board_admin_grants', 'cards', 'audit_events'];
    const before = tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    createSchema(db);
    createSchema(db);
    expect(db.prepare('SELECT * FROM user_board_navigation').all()).toEqual([]);
    expect(tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())).toEqual(before);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
