import type Database from 'better-sqlite3';
import { createIdentitySchema } from './identity-schema';
import { createLifecycleSchema } from './lifecycle-schema';

export function createSchema(db: Database.Database) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      initials TEXT NOT NULL,
      color TEXT NOT NULL,
      theme_preference TEXT NOT NULL DEFAULT 'dark',
      username TEXT NOT NULL UNIQUE,
      platform_role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      visibility TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, workspace_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workspace_admin_grants (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      granted_by_user_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, workspace_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_admin_grants_user
      ON workspace_admin_grants(user_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_admin_grants_workspace
      ON workspace_admin_grants(workspace_id);

    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      visibility TEXT NOT NULL,
      color TEXT NOT NULL,
      starred INTEGER NOT NULL DEFAULT 0,
      labels_json TEXT NOT NULL,
      labels_revision INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS board_memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      board_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, board_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
    );


    CREATE TABLE IF NOT EXISTS board_admin_grants (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      board_id TEXT NOT NULL,
      granted_by_user_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, board_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE,
      FOREIGN KEY(granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_board_admin_grants_user
      ON board_admin_grants(user_id);
    CREATE INDEX IF NOT EXISTS idx_board_admin_grants_board
      ON board_admin_grants(board_id);
    CREATE INDEX IF NOT EXISTS idx_board_memberships_user
      ON board_memberships(user_id);
    CREATE INDEX IF NOT EXISTS idx_board_memberships_board
      ON board_memberships(board_id);

    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      board_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      description_json TEXT,
      list_id TEXT NOT NULL,
      board_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      member_ids_json TEXT NOT NULL,
      label_ids_json TEXT NOT NULL,
      checklists_json TEXT NOT NULL,
      due_date TEXT,
      due_date_complete INTEGER NOT NULL DEFAULT 0,
      comments_json TEXT NOT NULL,
      activity_json TEXT NOT NULL,
      attachments_json TEXT NOT NULL,
      watching INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(list_id) REFERENCES lists(id) ON DELETE CASCADE,
      FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS automation_rules (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      name TEXT NOT NULL,
      trigger TEXT NOT NULL,
      trigger_config_json TEXT NOT NULL,
      conditions_json TEXT NOT NULL DEFAULT '{"listId":null,"labelId":null}',
      action TEXT NOT NULL,
      action_config_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      board_id TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      user_id TEXT PRIMARY KEY,
      temporary_password_hash TEXT NOT NULL,
      issued_by_user_id TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      consumed_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(issued_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      target_user_id TEXT,
      scope_type TEXT NOT NULL,
      scope_id TEXT,
      action TEXT NOT NULL,
      outcome TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
      ON audit_events(created_at DESC);

    CREATE TABLE IF NOT EXISTS recovery_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      key_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      max_labels_per_board INTEGER NOT NULL CHECK (max_labels_per_board BETWEEN 1 AND 100),
      updated_at TEXT NOT NULL
    );
  `);

  const boardColumns = new Set(
    (db.prepare('PRAGMA table_info(boards)').all() as Array<{ name: string }>).map(column => column.name),
  );

  if (!boardColumns.has('labels_revision')) {
    db.exec('ALTER TABLE boards ADD COLUMN labels_revision INTEGER NOT NULL DEFAULT 0');
  }

  db.prepare(`
    INSERT OR IGNORE INTO platform_settings (id, max_labels_per_board, updated_at)
    VALUES (1, 12, ?)
  `).run(new Date().toISOString());
  db.prepare(`
    UPDATE platform_settings
    SET max_labels_per_board = 12, updated_at = ?
    WHERE id = 1
      AND (typeof(max_labels_per_board) != 'integer' OR max_labels_per_board NOT BETWEEN 1 AND 100)
  `).run(new Date().toISOString());

  db.transaction(() => {
    db.exec(`
      INSERT OR IGNORE INTO workspace_admin_grants (id, user_id, workspace_id, granted_by_user_id, created_at)
      SELECT 'legacy-workspace-admin-' || id, user_id, workspace_id, NULL, created_at
      FROM workspace_memberships
      WHERE role = 'workspace_admin';

      INSERT OR IGNORE INTO board_admin_grants (id, user_id, board_id, granted_by_user_id, created_at)
      SELECT 'legacy-board-admin-' || id, user_id, board_id, NULL, created_at
      FROM board_memberships
      WHERE role = 'board_admin';

      UPDATE board_memberships
      SET role = 'member'
      WHERE role = 'board_admin';

      INSERT OR IGNORE INTO board_memberships (id, user_id, board_id, role, created_at)
      SELECT
        'legacy-card-member-' || cards.board_id || '-' || users.id,
        users.id,
        cards.board_id,
        'member',
        cards.created_at
      FROM cards
      JOIN json_each(cards.member_ids_json) AS assigned_user
      JOIN users ON users.id = assigned_user.value;
    `);
  })();

  const userColumns = new Set(
    (db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map(column => column.name),
  );

  if (!userColumns.has('theme_preference')) {
    db.exec("ALTER TABLE users ADD COLUMN theme_preference TEXT NOT NULL DEFAULT 'dark'");
  }

  if (!userColumns.has('default_workspace_id')) {
    db.exec('ALTER TABLE users ADD COLUMN default_workspace_id TEXT');
  }

  if (!userColumns.has('default_board_id')) {
    db.exec('ALTER TABLE users ADD COLUMN default_board_id TEXT');
  }

  const cardColumns = new Set(
    (db.prepare('PRAGMA table_info(cards)').all() as Array<{ name: string }>).map(column => column.name),
  );

  if (!cardColumns.has('description_json')) {
    db.exec('ALTER TABLE cards ADD COLUMN description_json TEXT');
  }

  if (!cardColumns.has('archived_by_list_id')) {
    db.exec('ALTER TABLE cards ADD COLUMN archived_by_list_id TEXT REFERENCES lists(id) ON DELETE SET NULL');
  }

  const automationRuleColumns = new Set(
    (db.prepare('PRAGMA table_info(automation_rules)').all() as Array<{ name: string }>).map(column => column.name),
  );

  if (!automationRuleColumns.has('conditions_json')) {
    db.exec("ALTER TABLE automation_rules ADD COLUMN conditions_json TEXT NOT NULL DEFAULT '{\"listId\":null,\"labelId\":null}'");
  }

  if (!automationRuleColumns.has('last_run_at')) {
    db.exec('ALTER TABLE automation_rules ADD COLUMN last_run_at TEXT');
  }
  createIdentitySchema(db);
  createLifecycleSchema(db);

}
