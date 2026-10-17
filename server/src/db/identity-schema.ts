import type Database from 'better-sqlite3';
import { createInvitationRevocationTriggers } from './invitation-revocation-schema';

export function createIdentitySchema(db: Database.Database) {
  db.transaction(() => {
    db.exec(`
    CREATE TABLE IF NOT EXISTS user_board_navigation (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      last_visited_at TEXT,
      starred INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0, 1)),
      starred_at TEXT,
      PRIMARY KEY (user_id, board_id)
    );
    CREATE INDEX IF NOT EXISTS idx_navigation_recent
      ON user_board_navigation(user_id, last_visited_at DESC, board_id);
    CREATE INDEX IF NOT EXISTS idx_navigation_starred
      ON user_board_navigation(user_id, starred, starred_at DESC, board_id);

      CREATE TABLE IF NOT EXISTS board_invitations (
        id TEXT PRIMARY KEY,
        board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
        target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('member', 'observer')),
        token_hash TEXT NOT NULL UNIQUE,
        issuer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        accepted_at TEXT,
        revoked_at TEXT,
        revoked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        revocation_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_invitations_board ON board_invitations(board_id, created_at DESC, id);
      CREATE INDEX IF NOT EXISTS idx_invitations_issuer ON board_invitations(issuer_user_id);
      CREATE INDEX IF NOT EXISTS idx_invitations_target ON board_invitations(target_user_id, board_id);
      CREATE INDEX IF NOT EXISTS idx_invitations_terminal ON board_invitations(COALESCE(revoked_at, accepted_at, expires_at));
    `);
    createInvitationRevocationTriggers(db);
  })();
}
