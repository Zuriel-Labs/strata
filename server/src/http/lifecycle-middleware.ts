import type Database from 'better-sqlite3';
import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './auth-middleware';
import { canReadBoardContent as canAccessBoard, canReadWorkspaceContent as canAccessWorkspace } from '../rbac/policies';
import { isBoardActive, isListActive, isWorkspaceActive } from '../rbac/lifecycle';

export function guardLifecycleWrites(db: Database.Database) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    const requestPath = request.path.replace(/^\/api\/v1(?=\/)/, '/api');
    if (!request.auth || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) { next(); return; }
    // Lifecycle transitions and reviewed content operations enforce their own parent rules.
    if (/^\/api\/(workspaces|boards)\/[^/]+\/(close|reopen)$/.test(requestPath) || requestPath.startsWith('/api/content-operations')) { next(); return; }
    const match = requestPath.match(/^\/api\/(?:admin\/|auth\/navigation\/)?(workspaces|boards|lists|cards|automation-rules)(?:\/([^/]+))?/);
    if (!match) { next(); return; }
    const [, kind, id] = match;
    const body = typeof request.body === 'object' && request.body !== null ? request.body as Record<string, unknown> : {};
    let boardId: string | undefined;
    let workspaceId: string | undefined;
    let listId: string | undefined;
    let cardArchived = false;
    if (kind === 'workspaces') workspaceId = id;
    if (kind === 'boards') { boardId = id; if (!id && typeof body.workspaceId === 'string') workspaceId = body.workspaceId; }
    if (kind === 'lists' && id) {
      const row = db.prepare('SELECT board_id AS boardId FROM lists WHERE id = ?').get(id) as { boardId: string } | undefined;
      boardId = row?.boardId;
      if (!/\/(restore|archive)$/.test(requestPath) && request.method !== 'DELETE') listId = id;
    }
    if (kind === 'cards' && id) {
      const row = db.prepare('SELECT board_id AS boardId, list_id AS listId, archived FROM cards WHERE id = ?').get(id) as { boardId: string; listId: string; archived: number } | undefined;
      boardId = row?.boardId; listId = row?.listId;
      cardArchived = Boolean(row?.archived) && !(request.method === 'PATCH' && Object.keys(body).length === 1 && body.archived === false) && request.method !== 'DELETE';
    }
    if (kind === 'automation-rules' && id) boardId = (db.prepare('SELECT board_id AS boardId FROM automation_rules WHERE id = ?').get(id) as { boardId: string } | undefined)?.boardId;
    if (!id && typeof body.boardId === 'string') boardId = body.boardId;
    if (boardId && canAccessBoard(db, request.auth, boardId)) {
      const template = Boolean(db.prepare('SELECT is_template FROM boards WHERE id = ?').pluck().get(boardId));
      if (template && (requestPath.includes('/comments') || requestPath.includes('/invitations') || requestPath.includes('/members') || (kind === 'cards' && ('memberIds' in body || 'watching' in body)))) {
        response.status(409).json({ code: 'TEMPLATE_READ_ONLY', message: 'Convert the template to a board before collaborating.' }); return;
      }
      if (!isBoardActive(db, boardId) || (listId && !isListActive(db, listId)) || cardArchived) {
        response.status(409).json({ code: 'PARENT_INACTIVE', message: 'Restore or reopen the parent before changing this content.' }); return;
      }
    }
    if (workspaceId && canAccessWorkspace(request.auth, workspaceId) && !isWorkspaceActive(db, workspaceId)) {
      response.status(409).json({ code: 'PARENT_INACTIVE', message: 'Reopen the workspace before changing its content.' }); return;
    }
    next();
  };
}
