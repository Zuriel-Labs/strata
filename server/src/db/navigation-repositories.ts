import type Database from 'better-sqlite3';
import { audit } from '../audit/audit-log';

export function setPersonalBoardStar(db: Database.Database, userId: string, boardId: string, starred: boolean) {
  db.transaction(() => {
    const previous = db.prepare('SELECT starred FROM user_board_navigation WHERE user_id = ? AND board_id = ?')
      .get(userId, boardId) as { starred: number } | undefined;
    if (Boolean(previous?.starred) === starred) return;
    db.prepare(`INSERT INTO user_board_navigation (user_id, board_id, starred, starred_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, board_id) DO UPDATE SET starred = excluded.starred, starred_at = excluded.starred_at`)
      .run(userId, boardId, starred ? 1 : 0, starred ? new Date().toISOString() : null);
    db.prepare('DELETE FROM user_board_navigation WHERE user_id = ? AND board_id = ? AND starred = 0 AND last_visited_at IS NULL').run(userId, boardId);
    audit(db, { actorUserId: userId, scopeType: 'board', scopeId: boardId, action: 'auth.navigation_star', outcome: 'success', metadata: { starred } });
  })();
}
