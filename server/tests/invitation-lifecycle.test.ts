// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseHandle } from '../src/db/database';
import { replaceAssignments } from '../src/db/admin-repositories';

describe('board invitation lifecycle', () => {
  let db: DatabaseHandle;
  beforeEach(async () => { process.env.SEED_DATA = 'true'; db = await createDatabase(':memory:'); });
  afterEach(() => db.close());

  it('preserves unchanged authority and membership identities during assignment reconciliation', () => {
    const tables = ['workspace_admin_grants', 'board_admin_grants', 'board_memberships'];
    const before = tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    replaceAssignments(db, 'u1', 'u2', { workspaceAdminWorkspaceIds: ['w1'], boardAdminBoardIds: [], boardMemberships: [] });
    replaceAssignments(db, 'u1', 'u4', { workspaceAdminWorkspaceIds: [], boardAdminBoardIds: ['b1'], boardMemberships: [{ boardId: 'b2', role: 'observer' }] });
    expect(tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all())).toEqual(before);
  });
});
