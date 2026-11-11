import type Database from 'better-sqlite3';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../http/auth-middleware';
import { authenticateBearer, isWithinResources } from './credentials';
import { consumeRate } from './rate-limit';
import { actionIds } from './actions';
import { matchOperation } from './operations';
import { hashBoardInvitationToken } from '../db/invitation-repositories';
import { audit } from '../audit/audit-log';
import { apiRequestContext } from './request-context';

export function normalizeApiErrors(_request: AuthenticatedRequest, response: Response, next: NextFunction) {
  const sendJson = response.json.bind(response);
  response.json = (body: unknown) => {
    if (response.statusCode >= 400) {
      const error = body && typeof body === 'object' ? body as Record<string, unknown> : {};
      const codes: Record<number,string> = {400:'INPUT_INVALID',401:'INVALID_CREDENTIAL',403:'ACTION_FORBIDDEN',404:'RESOURCE_UNAVAILABLE',409:'REVISION_CONFLICT',413:'PAYLOAD_TOO_LARGE',429:'RATE_LIMITED'};
      const code = typeof error.code === 'string' ? error.code : codes[response.statusCode] ?? 'OPERATION_FAILED';
      const message = response.statusCode >= 500 ? 'Unable to complete the operation. Reconcile state before retrying.' : typeof error.message === 'string' && !/SQLITE|constraint|database|ENOENT/i.test(error.message) ? error.message : 'Invalid or unavailable request.';
      return sendJson({code,message});
    }
    return sendJson(body);
  };
  next();
}

export function attachApiPrincipal(db: Database.Database) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    request.auth = authenticateBearer(db, request.get('Authorization'));
    if (!request.auth?.credential) { response.set('WWW-Authenticate', 'Bearer realm="strata", error="invalid_token"').status(401).json({ code: 'INVALID_CREDENTIAL', message: 'A valid API credential is required.' }); return; }
    const credential = request.auth.credential;
    const retry = consumeRate(db, `api:${credential.id}`, 120);
    if (retry) { response.set('Retry-After', String(retry)).status(429).json({ code: 'RATE_LIMITED', message: 'Wait before retrying.' }); return; }
    const matched = matchOperation(request.method, request.path);
    if (!matched) { response.status(404).json({ code: 'OPERATION_UNAVAILABLE', message: 'Supported operation unavailable.' }); return; }
    const { operation, params } = matched;
    const serviceActor = credential.serviceAccountId ? {serviceAccountId:credential.serviceAccountId,serviceAccountName:credential.name} : {};
    const deny = (code:string, message:string) => {
      audit(db,{actorUserId:request.auth!.user.id,scopeType:'auth',action:'api.operation.denied',outcome:'failure',metadata:{credentialId:credential.id,operationId:`${operation.method} ${operation.path}`,reason:code,...serviceActor}});
      response.status(403).json({code,message});
    };
    const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
    const actions = actionIds(operation, body);
    if (credential.actions && (!actions.length || actions.some(action => !credential.actions!.includes(action)))) {
      deny('ACTION_FORBIDDEN','This key does not allow this action.'); return;
    }
    const needed = [...operation.scopes];
    if (request.path.startsWith('/content-operations') && (body.kind === 'delete' || (typeof body.kind === 'string' && /^(board|list)_/.test(body.kind)))) needed.push('content:manage');
    if (request.path.match(/^\/cards\/[^/]+$/) && body.archived !== undefined) needed.push('content:manage');
    if (needed.some(scope => !credential.scopes.includes(scope)) || (operation.platform && (!credential.resources.includes('platform') || request.auth.user.platformRole !== 'system_admin'))) {
      deny('INSUFFICIENT_SCOPE','Approved permissions do not allow this operation.'); return;
    }
    const references: Array<{ kind: 'workspace' | 'board'; id: string }> = [];
    const reference = (kind: string, value: unknown) => {
      if (typeof value !== 'string') return;
      if (kind === 'workspace' || kind === 'board') { references.push({ kind, id: value }); return; }
      const table = { list: 'lists', card: 'cards', rule: 'automation_rules', notification: 'notifications', collection: 'board_collections' }[kind];
      if (!table) return;
      const column = kind === 'collection' ? 'workspace_id' : 'board_id';
      const id = db.prepare(`SELECT ${column} FROM ${table} WHERE id = ?`).pluck().get(value);
      if (typeof id === 'string') references.push({ kind: kind === 'collection' ? 'workspace' : 'board', id });
    };
    for (const [key, value] of Object.entries(params)) {
      const kind = key === 'id' ? request.path.split('/').filter(Boolean).at(request.path.startsWith('/auth/list-preferences') ? 1 : 0)?.replace(/s$/, '') : key.replace(/Id$/, '');
      reference(kind === 'list-preference' ? 'list' : kind ?? '', value);
    }
    for (const [key, value] of Object.entries(body)) {
      const kind = ({ workspaceId: 'workspace', boardId: 'board', listId: 'list', toListId: 'list', destinationWorkspaceId: 'workspace', destinationBoardId: 'board', destinationListId: 'list', defaultWorkspaceId: 'workspace', defaultBoardId: 'board' } as Record<string,string>)[key];
      if (kind) reference(kind, value);
    }
    if (typeof body.sourceId === 'string') reference(body.kind === 'delete' ? String(body.resourceType) : String(body.kind).split('_')[0], body.sourceId.trim());
    if (request.path === '/auth/board-invitations/accept' && typeof body.token === 'string') {
      const boardId = db.prepare('SELECT board_id FROM board_invitations WHERE token_hash = ?').pluck().get(hashBoardInvitationToken(body.token));
      if (typeof boardId === 'string') reference('board', boardId);
    }
    if (references.some(item => !isWithinResources(db, credential.resources, item.kind, item.id) && !(['GET','HEAD'].includes(request.method) && item.kind === 'workspace' && request.auth!.derivedWorkspaceIds.includes(item.id)))) { deny('RESOURCE_FORBIDDEN','Approved resources do not allow this operation.'); return; }
    if (request.method === 'DELETE' && /^\/admin\/users\//.test(request.path) && body.confirmation !== 'DELETE') { response.status(400).json({ code: 'CONFIRMATION_REQUIRED', message: 'Type DELETE to confirm account deletion.' }); return; }
    db.prepare('UPDATE api_grants SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), credential.id);
    apiRequestContext.run({ credentialId: credential.id, operationId: `${operation.method} ${operation.path}`, ...serviceActor }, next);
  };
}
