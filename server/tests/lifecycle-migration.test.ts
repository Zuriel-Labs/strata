// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createDatabase } from '../src/db/database';
import { createSchema } from '../src/db/schema';

it('adds lifecycle columns to legacy rows twice and survives a file-backed restart without data loss', async () => {
  process.env.SEED_DATA = 'true';
  const directory = mkdtempSync(join(tmpdir(), 'strata-lifecycle-'));
  let db: Awaited<ReturnType<typeof createDatabase>> | undefined;
  try {
    const file = join(directory, 'legacy.sqlite');
    db = await createDatabase(file);
    createSchema(db);
    db.exec('PRAGMA foreign_keys = OFF');
    for (const table of ['content_operation_effects', 'content_operations', 'lifecycle_tombstones', 'user_list_preferences', 'board_collection_items', 'board_collections']) db.exec(`DROP TABLE ${table}`);
    for (const table of ['workspaces', 'boards', 'lists', 'cards']) {
      db.exec(`DROP TRIGGER ${table}_content_revision`);
      const columns = ['revision', ...(['workspaces', 'boards'].includes(table) ? ['lifecycle_state', 'closed_at', 'closed_by_user_id'] : []), ...(table === 'boards' ? ['is_template', 'source_template_id', 'source_template_revision'] : []), ...(table === 'lists' ? ['color'] : []), ...(table === 'cards' ? ['archived_by_list_id'] : [])];
      for (const column of columns) db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
    }
    db.exec('PRAGMA foreign_keys = ON');
    const tables = ['users', 'workspaces', 'boards', 'lists', 'cards', 'workspace_admin_grants', 'board_admin_grants', 'board_memberships', 'audit_events'];
    const before = new Map(tables.map(table => [table, db!.prepare(`SELECT * FROM ${table} ORDER BY id`).all() as Record<string, unknown>[]]));
    createSchema(db);
    createSchema(db);
    db.close(); db = await createDatabase(file);
    for (const table of tables) {
      const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id`).all() as Record<string, unknown>[];
      const original = before.get(table)!;
      expect(rows.map(row => Object.fromEntries(Object.keys(original[0] ?? {}).map(key => [key, row[key]])))).toEqual(original);
    }
    expect(db.prepare("SELECT COUNT(*) FROM boards WHERE lifecycle_state = 'active' AND is_template = 0 AND revision = 0").pluck().get()).toBe(3);
    expect(db.prepare('PRAGMA integrity_check').pluck().get()).toBe('ok');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally { db?.close(); rmSync(directory, { recursive: true, force: true }); }
});
