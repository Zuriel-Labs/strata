import type Database from 'better-sqlite3';

export function isWorkspaceActive(db: Database.Database, workspaceId: string) {
  return Boolean(db.prepare("SELECT 1 FROM workspaces WHERE id = ? AND lifecycle_state = 'active'").get(workspaceId));
}

export function isBoardActive(db: Database.Database, boardId: string) {
  return Boolean(db.prepare(`SELECT 1 FROM boards b JOIN workspaces w ON w.id = b.workspace_id
    WHERE b.id = ? AND b.lifecycle_state = 'active' AND w.lifecycle_state = 'active'`).get(boardId));
}

export function isListActive(db: Database.Database, listId: string) {
  const list = db.prepare('SELECT board_id AS boardId, archived FROM lists WHERE id = ?').get(listId) as { boardId: string; archived: number } | undefined;
  return Boolean(list && !list.archived && isBoardActive(db, list.boardId));
}
