// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, closeDatabase } from '../src/db/database';
import { createSchema } from '../src/db/schema';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
});

describe('layered access migration', () => {
  afterEach(() => {
    closeDatabase();
  });

  it('migrates legacy administrator roles into independent grants and retains collaboration', async () => {
    const db = await createDatabase(':memory:');
    db.prepare('DELETE FROM workspace_admin_grants WHERE user_id = ? AND workspace_id = ?').run('u2', 'w1');
    db.prepare('DELETE FROM board_admin_grants WHERE user_id = ? AND board_id = ?').run('u4', 'b1');
    db.prepare("INSERT INTO workspace_memberships (id, user_id, workspace_id, role, created_at) VALUES ('legacy-wa', 'u2', 'w1', 'workspace_admin', '2026-01-01T00:00:00.000Z')").run();
    db.prepare("INSERT INTO board_memberships (id, user_id, board_id, role, created_at) VALUES ('legacy-ba', 'u4', 'b1', 'board_admin', '2026-01-01T00:00:00.000Z')").run();

    createSchema(db);

    const workspaceGrant = db.prepare('SELECT user_id, workspace_id FROM workspace_admin_grants WHERE user_id = ? AND workspace_id = ?').get('u2', 'w1');
    const boardGrant = db.prepare('SELECT user_id, board_id FROM board_admin_grants WHERE user_id = ? AND board_id = ?').get('u4', 'b1');
    const retainedMembership = db.prepare('SELECT role FROM board_memberships WHERE user_id = ? AND board_id = ?').get('u4', 'b1') as { role: string } | undefined;

    expect(workspaceGrant).toBeDefined();
    expect(boardGrant).toBeDefined();
    expect(retainedMembership?.role).toBe('member');
    const orphanedCardAssignments = db.prepare(`
      SELECT cards.id
      FROM cards
      JOIN json_each(cards.member_ids_json) AS assigned_user
      LEFT JOIN board_memberships
        ON board_memberships.board_id = cards.board_id
       AND board_memberships.user_id = assigned_user.value
      WHERE board_memberships.id IS NULL
    `).all();
    expect(orphanedCardAssignments).toEqual([]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
  });

  it('is idempotent and preserves legacy workspace rows for rollback evidence', async () => {
    const db = await createDatabase(':memory:');
    createSchema(db);
    const before = {
      workspaceGrants: (db.prepare('SELECT COUNT(*) AS count FROM workspace_admin_grants').get() as { count: number }).count,
      boardGrants: (db.prepare('SELECT COUNT(*) AS count FROM board_admin_grants').get() as { count: number }).count,
      workspaceRows: (db.prepare('SELECT COUNT(*) AS count FROM workspace_memberships').get() as { count: number }).count,
      boardRows: (db.prepare('SELECT COUNT(*) AS count FROM board_memberships').get() as { count: number }).count,
    };

    createSchema(db);
    createSchema(db);

    expect({
      workspaceGrants: (db.prepare('SELECT COUNT(*) AS count FROM workspace_admin_grants').get() as { count: number }).count,
      boardGrants: (db.prepare('SELECT COUNT(*) AS count FROM board_admin_grants').get() as { count: number }).count,
      workspaceRows: (db.prepare('SELECT COUNT(*) AS count FROM workspace_memberships').get() as { count: number }).count,
      boardRows: (db.prepare('SELECT COUNT(*) AS count FROM board_memberships').get() as { count: number }).count,
    }).toEqual(before);
  });
});
