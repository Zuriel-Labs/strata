import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AuthContextValue } from '../types';
import { getBoardAdminGrantsForUser, getBoardMembershipsForUser, getDerivedWorkspaceIdsForUser, getUserById, getWorkspaceAdminGrantsForUser } from '../db/repositories';
import { canAccessBoard, canAccessWorkspace, canEditBoardCards, canManageBoard, canManageWorkspace } from '../rbac/permissions';
import { canAccessAdminPanel } from '../rbac/policies';
import { audit } from '../audit/audit-log';
import { ApiAuthorizationError, type ApiCredential, type ApiGrant, type GrantInput, type AuthorityCeiling } from './contract';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export const afterSeconds = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
export function userContext(db: Database.Database, userId: string): AuthContextValue | null {
  const user = getUserById(db, userId);
  if (!user?.active || user.mustChangePassword) return null;
  return { user, session: { id: '', userId, createdAt: '', expiresAt: '', lastSeenAt: '' }, workspaceAdminGrants: getWorkspaceAdminGrantsForUser(db, userId), boardAdminGrants: getBoardAdminGrantsForUser(db, userId), boardMemberships: getBoardMembershipsForUser(db, userId), derivedWorkspaceIds: getDerivedWorkspaceIdsForUser(db, userId) };
}
export function authorityCeiling(actor: AuthContextValue): AuthorityCeiling {
  return { system: actor.user.platformRole === 'system_admin', workspaceAdmins: actor.workspaceAdminGrants.map(item => item.workspaceId), boardAdmins: actor.boardAdminGrants.map(item => item.boardId), memberships: actor.boardMemberships.map(({ boardId, role }) => ({ boardId, role })) };
}
export function readGrant(db: Database.Database, id: string): ApiGrant | null {
  const row = db.prepare('SELECT * FROM api_grants WHERE id = ?').get(id) as Record<string, string | null> | undefined;
  if (!row) return null;
  return { id: String(row.id), userId: String(row.user_id), name: String(row.name), kind: row.kind as ApiGrant['kind'], clientId: row.client_id, scopes: JSON.parse(String(row.scopes_json)), resources: JSON.parse(String(row.resources_json)), actions: row.actions_json ? JSON.parse(row.actions_json) : null, serviceAccountId: row.service_account_id ?? null, authority: JSON.parse(String(row.authority_json)), expiresAt: String(row.expires_at), createdAt: String(row.created_at), lastUsedAt: row.last_used_at, revokedAt: row.revoked_at };
}
export function isWithinResources(db: Database.Database, resources: string[], kind: 'workspace' | 'board', id: string) {
  if (resources.includes('platform') || resources.includes(`${kind}:${id}`)) return true;
  if (kind === 'board') {
    const workspaceId = db.prepare('SELECT workspace_id FROM boards WHERE id = ?').pluck().get(id);
    return typeof workspaceId === 'string' && resources.includes(`workspace:${workspaceId}`);
  }
  return false;
}
export function validateGrantAuthority(db: Database.Database, actor: AuthContextValue, input: Pick<GrantInput, 'scopes' | 'resources'>) {
  if (actor.credential) throw new ApiAuthorizationError(403, 'BROWSER_APPROVAL_REQUIRED', 'Use your browser account to approve credentials.');
  const admin = actor.user.platformRole === 'system_admin';
  for (const resource of input.resources) {
    if (resource === 'account') { if (input.scopes.some(scope => !scope.startsWith('account:'))) throw new ApiAuthorizationError(403, 'GRANT_FORBIDDEN', 'Account-only resources require account permissions.'); continue; }
    if (resource === 'platform') { if (!admin) throw new ApiAuthorizationError(403, 'GRANT_FORBIDDEN', 'Requested permissions are unavailable.'); continue; }
    const [kind, id] = resource.split(':');
    const exists = db.prepare(`SELECT 1 FROM ${kind === 'board' ? 'boards' : 'workspaces'} WHERE id = ?`).get(id);
    if (!exists || !(kind === 'board' ? canAccessBoard(db, actor, id) : canAccessWorkspace(actor, id))) throw new ApiAuthorizationError(403, 'GRANT_FORBIDDEN', 'Requested permissions are unavailable.');
    if (input.scopes.some(scope => scope === 'content:manage' || scope.startsWith('administration:'))
      && !(kind === 'board' ? canManageBoard(db, actor, id) : canManageWorkspace(actor, id))) throw new ApiAuthorizationError(403, 'GRANT_FORBIDDEN', 'Requested permissions are unavailable.');
    if (input.scopes.includes('content:write') && !(kind === 'board' ? canEditBoardCards(db, actor, id) : canManageWorkspace(actor, id))) throw new ApiAuthorizationError(403, 'GRANT_FORBIDDEN', 'Requested permissions are unavailable.');
  }
}
export function createGrant(db: Database.Database, actor: AuthContextValue, input: Omit<GrantInput, 'confirmation'>, kind: ApiGrant['kind'], clientId: string | null = null, maximumExpiresAt?: string, actions?: string[], serviceAccountId?: string) {
  validateGrantAuthority(db, actor, input);
  if (Number(db.prepare("SELECT COUNT(*) FROM api_grants WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?").pluck().get(actor.user.id, new Date().toISOString())) >= 100) throw new ApiAuthorizationError(409, 'CONNECTION_LIMIT', 'Revoke an existing connection before adding another.');
  const id = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + input.expiresInDays * 86400000).toISOString();
  db.prepare('INSERT INTO api_grants (id,user_id,name,kind,client_id,scopes_json,resources_json,authority_json,created_at,expires_at,actions_json,service_account_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, actor.user.id, input.name, kind, clientId, JSON.stringify(input.scopes), JSON.stringify(input.resources), JSON.stringify(authorityCeiling(actor)), createdAt.toISOString(), maximumExpiresAt && maximumExpiresAt < expiresAt ? maximumExpiresAt : expiresAt, actions ? JSON.stringify(actions) : null, serviceAccountId ?? null);
  audit(db, { actorUserId: actor.user.id, scopeType: 'auth', action: 'api.connection.create', outcome: 'success', metadata: { credentialId: id, kind, scopes: input.scopes, resources: input.resources, ...(actions && { actions }), ...(serviceAccountId && { serviceAccountId }) } });
  const grant = readGrant(db, id);
  if (!grant) throw new Error('Connection creation failed.');
  return grant;
}
export function issueToken(db: Database.Database, grant: ApiGrant, kind: 'pat' | 'access' | 'refresh') {
  // Older servers must reject granular keys instead of treating them as broad PATs.
  const prefix = kind === 'pat' && grant.actions ? 'key' : kind;
  const raw = `strata_${prefix}_${secret()}`;
  const expiresAt = kind === 'access' ? [afterSeconds(600), grant.expiresAt].sort()[0] : grant.expiresAt;
  const id = randomUUID();
  db.prepare('INSERT INTO api_tokens (id,grant_id,token_hash,kind,expires_at) VALUES (?,?,?,?,?)').run(id, grant.id, digest(raw), kind, expiresAt);
  return { raw, expiresAt, id };
}
export function revokeGrant(db: Database.Database, grant: ApiGrant, reason: string) {
  if (grant.revokedAt) return;
  db.prepare('UPDATE api_grants SET revoked_at = ? WHERE id = ?').run(new Date().toISOString(), grant.id);
  audit(db, { actorUserId: grant.userId, scopeType: 'auth', action: 'api.connection.revoke', outcome: 'success', metadata: { credentialId: grant.id, reason } });
}
export function credentialContext(db: Database.Database, tokenId: string, refresh = false): AuthContextValue | null {
  const token = db.prepare("SELECT grant_id, expires_at, consumed_at FROM api_tokens WHERE id = ? AND (kind IN ('pat','access') OR (? = 1 AND kind = 'refresh'))").get(tokenId, Number(refresh)) as { grant_id: string; expires_at: string; consumed_at: string | null } | undefined;
  if (!token || token.consumed_at || token.expires_at <= new Date().toISOString()) return null;
  const grant = readGrant(db, token.grant_id);
  if (!grant || grant.revokedAt || grant.expiresAt <= new Date().toISOString()) return null;
  return grantContext(db,grant,tokenId,token.expires_at);
}
export function grantContext(db: Database.Database, grant: ApiGrant, tokenId: string, expiresAt: string): AuthContextValue | null {
  const actor = userContext(db, grant.userId);
  if (!actor) return null;
  if (grant.serviceAccountId && (!canAccessAdminPanel(actor) || !grant.resources.every(resource => {
    if (resource === 'platform') return actor.user.platformRole === 'system_admin';
    const [kind,id] = resource.split(':');
    return kind === 'board' ? canManageBoard(db,actor,id) : kind === 'workspace' && canManageWorkspace(actor,id);
  }) || !db.prepare('SELECT 1 FROM api_service_accounts WHERE id = ? AND owner_user_id = ? AND grant_id = ?').get(grant.serviceAccountId,grant.userId,grant.id))) return null;
  const ceiling = grant.authority;
  if (!ceiling.system) {
    actor.user = { ...actor.user, platformRole: 'user' };
    actor.workspaceAdminGrants = actor.workspaceAdminGrants.filter(item => ceiling.workspaceAdmins.includes(item.workspaceId));
    actor.boardAdminGrants = actor.boardAdminGrants.filter(item => ceiling.boardAdmins.includes(item.boardId));
    actor.boardMemberships = actor.boardMemberships.flatMap(item => {
      const approved = ceiling.memberships.find(entry => entry.boardId === item.boardId);
      const workspaceId = db.prepare('SELECT workspace_id FROM boards WHERE id = ?').pluck().get(item.boardId);
      if (ceiling.boardAdmins.includes(item.boardId) || ceiling.workspaceAdmins.includes(String(workspaceId))) return [item];
      return approved ? [{ ...item, role: approved.role === 'observer' ? 'observer' as const : item.role }] : [];
    });
  }
  if (!grant.resources.includes('platform')) {
    const allowed = db.prepare(`SELECT id, workspace_id FROM boards
      WHERE id IN (SELECT substr(value,7) FROM json_each(?) WHERE value LIKE 'board:%')
        OR workspace_id IN (SELECT substr(value,11) FROM json_each(?) WHERE value LIKE 'workspace:%')`)
      .all(JSON.stringify(grant.resources),JSON.stringify(grant.resources)) as { id:string;workspace_id:string }[];
    const boardAdmins = allowed.filter(board => canManageBoard(db, actor, board.id));
    const memberships = allowed.filter(board => canAccessBoard(db, actor, board.id)).map(board => ({ id: `api-${board.id}`, userId: actor.user.id, boardId: board.id, role: canEditBoardCards(db, actor, board.id) ? 'member' as const : 'observer' as const, createdAt: grant.createdAt }));
    const workspaceAdmins = grant.resources.filter(resource => resource.startsWith('workspace:')).map(resource => resource.slice(10)).filter(id => canManageWorkspace(actor, id));
    actor.user = { ...actor.user, platformRole: 'user' };
    actor.boardAdminGrants = boardAdmins.map(board => ({ id: `api-${board.id}`, userId: actor.user.id, boardId: board.id, grantedByUserId: null, createdAt: grant.createdAt }));
    actor.boardMemberships = memberships;
    actor.workspaceAdminGrants = workspaceAdmins.map(workspaceId => ({ id: `api-${workspaceId}`, userId: actor.user.id, workspaceId, grantedByUserId: null, createdAt: grant.createdAt }));
  }
  actor.derivedWorkspaceIds = [...new Set([...actor.workspaceAdminGrants.map(item => item.workspaceId), ...actor.boardMemberships.map(item => String(db.prepare('SELECT workspace_id FROM boards WHERE id = ?').pluck().get(item.boardId)))])];
  actor.session = { id: `api:${tokenId}`, userId: actor.user.id, createdAt: grant.createdAt, expiresAt, lastSeenAt: new Date().toISOString() };
  actor.credential = { ...grant, tokenId } satisfies ApiCredential;
  return actor;
}
export function authenticateBearer(db: Database.Database, authorization: string | undefined) {
  const matched = authorization?.match(/^Bearer (strata_(?:pat|key|access)_[A-Za-z0-9_-]{43})$/i);
  if (!matched) return null;
  const id = db.prepare('SELECT id FROM api_tokens WHERE token_hash = ?').pluck().get(digest(matched[1]));
  return typeof id === 'string' ? credentialContext(db, id) : null;
}
