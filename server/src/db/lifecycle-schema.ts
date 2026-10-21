import type Database from 'better-sqlite3';

export function createLifecycleSchema(db: Database.Database) {
  db.transaction(() => {
    for (const table of ['workspaces', 'boards', 'lists', 'cards']) {
      const columns = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(row => row.name));
      const additions: Record<string, string> = { revision: 'INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)' };
      if (table === 'workspaces' || table === 'boards') Object.assign(additions, {
        lifecycle_state: "TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_state IN ('active', 'closed'))",
        closed_at: 'TEXT', closed_by_user_id: 'TEXT REFERENCES users(id) ON DELETE SET NULL',
      });
      if (table === 'boards') Object.assign(additions, {
        is_template: 'INTEGER NOT NULL DEFAULT 0 CHECK (is_template IN (0, 1))',
        source_template_id: 'TEXT', source_template_revision: 'INTEGER',
      });
      if (table === 'lists') additions.color = 'TEXT';
      for (const [name, definition] of Object.entries(additions)) {
        if (!columns.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
      }
      db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_content_revision AFTER UPDATE ON ${table}
        WHEN NEW.revision = OLD.revision BEGIN
          UPDATE ${table} SET revision = OLD.revision + 1 WHERE id = NEW.id;
        END;`);
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS board_collections (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
        UNIQUE(workspace_id, name COLLATE NOCASE)
      );
      CREATE TABLE IF NOT EXISTS board_collection_items (
        collection_id TEXT NOT NULL REFERENCES board_collections(id) ON DELETE CASCADE,
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        PRIMARY KEY(collection_id, board_id)
      );
      CREATE TABLE IF NOT EXISTS user_list_preferences (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
        collapsed INTEGER NOT NULL CHECK (collapsed IN (0, 1)), updated_at TEXT NOT NULL,
        PRIMARY KEY(user_id, list_id)
      );
      CREATE TABLE IF NOT EXISTS content_operations (
        id TEXT PRIMARY KEY, actor_user_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL, kind TEXT NOT NULL, result_json TEXT NOT NULL,
        http_status INTEGER NOT NULL, committed_at TEXT NOT NULL,
        UNIQUE(actor_user_id, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS content_operation_effects (
        operation_id TEXT NOT NULL REFERENCES content_operations(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        rule_id TEXT NOT NULL, subject_id TEXT NOT NULL, effect_kind TEXT NOT NULL,
        PRIMARY KEY(operation_id, rule_id, subject_id, effect_kind)
      );
      CREATE TABLE IF NOT EXISTS lifecycle_tombstones (
        id TEXT PRIMARY KEY, resource_type TEXT NOT NULL, resource_id TEXT NOT NULL,
        actor_user_id TEXT NOT NULL, operation_id TEXT NOT NULL, deleted_at TEXT NOT NULL,
        counts_json TEXT NOT NULL, UNIQUE(resource_type, resource_id)
      );
    `);
  })();
}
