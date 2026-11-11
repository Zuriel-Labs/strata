import type Database from 'better-sqlite3';
import { audit } from '../audit/audit-log';
import { personalNavigationAccessSql } from '../rbac/policies';

export interface NavigationCursor { userId: string; kind: 'recent' | 'starred'; timestamp: string; boardId: string }

export function recordPersonalBoardVisit(db: Database.Database, userId: string, boardId: string) {
  db.transaction(() => {
    db.prepare(`INSERT INTO user_board_navigation (user_id, board_id, last_visited_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id, board_id) DO UPDATE SET last_visited_at = excluded.last_visited_at`)
      .run(userId, boardId, new Date().toISOString());
    db.prepare(`UPDATE user_board_navigation SET last_visited_at = NULL
      WHERE user_id = @userId AND last_visited_at IS NOT NULL AND board_id NOT IN (
        SELECT board_id FROM user_board_navigation WHERE user_id = @userId AND last_visited_at IS NOT NULL
        ORDER BY last_visited_at DESC, board_id ASC LIMIT 50)`).run({ userId });
    db.prepare('DELETE FROM user_board_navigation WHERE user_id = ? AND starred = 0 AND last_visited_at IS NULL').run(userId);
    audit(db, {actorUserId:userId,scopeType:'board',scopeId:boardId,action:'auth.navigation_visit',outcome:'success'});
  })();
}

export function listPersonalBoardNavigation(db: Database.Database, userId: string, kind: 'recent' | 'starred', limit: number, cursor?: NavigationCursor, boardScope: string[] | null = null) {
  const orderColumn = kind === 'recent' ? 'last_visited_at' : 'starred_at';
  const rows = db.prepare(`SELECT boards.id AS boardId, boards.workspace_id AS workspaceId, boards.title, boards.color,
    n.starred, n.last_visited_at AS lastVisitedAt, n.${orderColumn} AS timestamp
    FROM user_board_navigation n JOIN boards ON boards.id = n.board_id
    WHERE (@boardScope IS NULL OR boards.id IN (SELECT value FROM json_each(@boardScope))) AND n.user_id = @userId AND n.${orderColumn} IS NOT NULL
      AND ${kind === 'starred' ? 'n.starred = 1 AND' : ''} ${personalNavigationAccessSql}
      AND (@timestamp IS NULL OR n.${orderColumn} < @timestamp OR (n.${orderColumn} = @timestamp AND boards.id > @boardId))
    ORDER BY n.${orderColumn} DESC, boards.id ASC LIMIT @limit`)
    .all({ userId, timestamp: cursor?.timestamp ?? null, boardId: cursor?.boardId ?? null, limit: limit + 1, boardScope: boardScope === null ? null : JSON.stringify(boardScope) }) as Array<{
      boardId: string; workspaceId: string; title: string; color: string; starred: number; lastVisitedAt: string | null; timestamp: string;
    }>;
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  return {
    items: visible.map(({ timestamp, ...row }) => { void timestamp; return { ...row, starred: Boolean(row.starred) }; }),
    nextCursor: rows.length > limit && last
      ? Buffer.from(JSON.stringify({ userId, kind, timestamp: last.timestamp, boardId: last.boardId })).toString('base64url') : null,
  };
}

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
