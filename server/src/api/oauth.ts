import { createHash, randomInt } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AuthContextValue } from '../types';
import { ApiAuthorizationError, resourceSchema, scopeSchema, type ApiGrant } from './contract';
import { afterSeconds, createGrant, credentialContext, grantContext, digest, issueToken, readGrant, revokeGrant, secret, validateGrantAuthority } from './credentials';
import { audit } from '../audit/audit-log';

export interface OAuthRequest {
  id: string; kind: 'device' | 'code'; client_id: string; name: string;
  scopes_json: string; resources_json: string; device_hash: string | null; user_code_hash: string | null;
  code_hash: string | null; redirect_uri: string | null; challenge: string | null; state: string | null;
  status: 'pending' | 'approved' | 'denied' | 'cancelled' | 'redeemed'; user_id: string | null; grant_id: string | null;
  created_at: string; expires_at: string; poll_interval: number; next_poll_at: string;
}
export function oauthError(error: string, description = 'Authorization request is unavailable or invalid.') { return { error, error_description: description }; }
export function readClient(db: Database.Database, id: string) {
  if (id === 'strata-cli') return { id, name: 'Strata CLI', redirectUris: [] as string[] };
  const row = db.prepare('SELECT id, name, redirect_uris_json FROM oauth_clients WHERE id = ?').get(id) as { id: string; name: string; redirect_uris_json: string } | undefined;
  return row ? { id: row.id, name: row.name, redirectUris: JSON.parse(row.redirect_uris_json) as string[] } : null;
}
export function parsePermissions(scope: string, resource: string) {
  const scopes = scopeSchema.safeParse(scope.trim().split(/\s+/));
  const resources = resourceSchema.safeParse(resource.trim().split(/\s+/));
  if (!scopes.success || !resources.success) return null;
  return { scopes: scopes.data, resources: resources.data };
}
export function newOAuthRequest(db: Database.Database, client: { id: string; name: string }, kind: OAuthRequest['kind'], scope: string, resource: string, code?: { redirectUri: string; challenge: string; state: string }) {
  const permissions = parsePermissions(scope, resource);
  if (!permissions) throw new ApiAuthorizationError(400, 'invalid_scope', 'Choose supported permissions and resource boundaries.');
  db.prepare('DELETE FROM oauth_requests WHERE expires_at < ?').run(new Date(Date.now()-86400000).toISOString());
  if (Number(db.prepare('SELECT COUNT(*) FROM oauth_requests').pluck().get()) >= 10000) throw new ApiAuthorizationError(429, 'temporarily_unavailable', 'Too many authorization requests. Retry later.');
  const id = secret(), deviceCode = secret();
  const alphabet = 'BCDFGHJKLMNPQRSTVWXZ';
  const letters = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
  const userCode = `${letters.slice(0,4)}-${letters.slice(4)}`;
  db.prepare(`INSERT INTO oauth_requests (id,kind,client_id,name,scopes_json,resources_json,device_hash,user_code_hash,redirect_uri,challenge,state,status,created_at,expires_at,next_poll_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?)`).run(id, kind, client.id, client.name, JSON.stringify(permissions.scopes), JSON.stringify(permissions.resources), kind === 'device' ? digest(deviceCode) : null, kind === 'device' ? digest(normalizeCode(userCode)) : null, code?.redirectUri ?? null, code?.challenge ?? null, code?.state ?? null, new Date().toISOString(), afterSeconds(600), afterSeconds(5));
  return { id, deviceCode, userCode };
}
export function normalizeCode(value: string) { return value.toUpperCase().replace(/[^A-Z]/g, ''); }
export function requestById(db: Database.Database, id: string) { return db.prepare('SELECT * FROM oauth_requests WHERE id = ?').get(id) as OAuthRequest | undefined; }
export function decideRequest(db: Database.Database, actor: AuthContextValue, id: string, decision: 'approve' | 'deny', userCode?: string) {
  return db.transaction(() => {
    const pending = requestById(db, id);
    if (!pending || pending.expires_at <= new Date().toISOString() || pending.status !== 'pending') throw new ApiAuthorizationError(409, 'REQUEST_UNAVAILABLE', 'Request expired or already handled. Return to your client.');
    if (pending.kind === 'device' && (!userCode || digest(normalizeCode(userCode)) !== pending.user_code_hash)) throw new ApiAuthorizationError(400, 'CODE_MISMATCH', 'The verification code must match your client.');
    if (!readClient(db, pending.client_id)) throw new ApiAuthorizationError(400, 'CLIENT_UNAVAILABLE', 'Client unavailable.');
    const permissions = { scopes: scopeSchema.parse(JSON.parse(pending.scopes_json)), resources: resourceSchema.parse(JSON.parse(pending.resources_json)) };
    let grant: ApiGrant | null = null;
    if (decision === 'approve') grant = createGrant(db, actor, { ...permissions, name: pending.name, expiresInDays: 30 }, pending.kind, pending.client_id, new Date(Date.parse(pending.created_at) + 30 * 86400000).toISOString());
    const code = decision === 'approve' && pending.kind === 'code' ? secret() : null;
    db.prepare('UPDATE oauth_requests SET status = ?, user_id = ?, grant_id = ?, code_hash = ?, expires_at = ? WHERE id = ?')
      .run(decision === 'approve' ? 'approved' : 'denied', actor.user.id, grant?.id ?? null, code ? digest(code) : null, pending.kind === 'code' ? afterSeconds(60) : pending.expires_at, id);
    audit(db, { actorUserId: actor.user.id, scopeType: 'auth', action: `api.authorization.${decision}`, outcome: 'success', metadata: { clientId: pending.client_id, credentialId: grant?.id ?? null, kind: pending.kind } });
    if (pending.kind === 'code' && pending.redirect_uri) {
      const redirect = new URL(pending.redirect_uri);
      redirect.searchParams.set('state', pending.state ?? '');
      redirect.searchParams.set(code ? 'code' : 'error', code ?? 'access_denied');
      return { status: decision === 'approve' ? 'approved' : 'denied', redirectUri: redirect.toString() };
    }
    return { status: decision === 'approve' ? 'approved' : 'denied' };
  }).immediate();
}
function tokenResponse(db: Database.Database, grant: ApiGrant) {
  db.prepare('UPDATE api_grants SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(),grant.id);
  const access = issueToken(db, grant, 'access');
  const refresh = issueToken(db, grant, 'refresh');
  return { access_token: access.raw, token_type: 'Bearer', expires_in: Math.max(0, Math.floor((Date.parse(access.expiresAt)-Date.now())/1000)), refresh_token: refresh.raw, scope: grant.scopes.join(' '), resource: grant.resources.join(' '), connection_id: grant.id };
}
export function exchangeToken(db: Database.Database, body: Record<string, string | undefined>) {
  return db.transaction(() => {
    const now = new Date().toISOString();
    if (body.grant_type === 'refresh_token') {
      const token = db.prepare("SELECT id, grant_id, consumed_at, expires_at FROM api_tokens WHERE token_hash = ? AND kind = 'refresh'").get(digest(body.refresh_token ?? '')) as { id: string; grant_id: string; consumed_at: string | null; expires_at: string } | undefined;
      const grant = token ? readGrant(db, token.grant_id) : null;
      if (!token || !grant || !body.client_id || grant.clientId !== body.client_id || grant.revokedAt || token.expires_at <= now || grant.expiresAt <= now) return oauthError('invalid_grant');
      if (token.consumed_at) { revokeGrant(db, grant, 'refresh_replay'); return oauthError('invalid_grant'); }
      if ((body.scope !== undefined && body.scope !== grant.scopes.join(' ')) || (body.resource !== undefined && body.resource !== grant.resources.join(' '))) return oauthError('invalid_scope', 'Renewal cannot change approved permissions or resources.');
      const actor = credentialContext(db, token.id, true);
      if (!actor) { revokeGrant(db, grant, 'authority_changed'); return oauthError('invalid_grant'); }
      const { credential, ...currentActor } = actor; void credential;
      try { validateGrantAuthority(db, currentActor, grant); }
      catch { revokeGrant(db, grant, 'authority_changed'); return oauthError('invalid_grant'); }
      db.prepare('UPDATE api_tokens SET consumed_at = ? WHERE id = ?').run(now, token.id);
      audit(db, { actorUserId: grant.userId, scopeType: 'auth', action: 'api.token.refresh', outcome: 'success', metadata: { credentialId: grant.id } });
      return tokenResponse(db, grant);
    }
    let pending: OAuthRequest | undefined;
    if (body.grant_type === 'urn:ietf:params:oauth:grant-type:device_code') {
      pending = db.prepare("SELECT * FROM oauth_requests WHERE device_hash = ? AND kind = 'device'").get(digest(body.device_code ?? '')) as OAuthRequest | undefined;
      if (!pending || body.client_id !== pending.client_id) return oauthError('invalid_grant');
      if (pending.expires_at <= now) return oauthError('expired_token');
      if (pending.status === 'denied' || pending.status === 'cancelled') return oauthError('access_denied');
      if (pending.status === 'redeemed') return oauthError('invalid_grant');
      if (pending.next_poll_at > now) {
        db.prepare('UPDATE oauth_requests SET poll_interval = poll_interval + 5, next_poll_at = ? WHERE id = ?').run(afterSeconds(pending.poll_interval + 5), pending.id);
        return oauthError('slow_down', 'Increase the polling interval by five seconds.');
      }
      db.prepare('UPDATE oauth_requests SET next_poll_at = ? WHERE id = ?').run(afterSeconds(pending.poll_interval), pending.id);
      if (pending.status === 'pending') return oauthError('authorization_pending');
    } else if (body.grant_type === 'authorization_code') {
      pending = db.prepare("SELECT * FROM oauth_requests WHERE code_hash = ? AND kind = 'code'").get(digest(body.code ?? '')) as OAuthRequest | undefined;
      if (!pending || pending.status !== 'approved' || pending.expires_at <= now || body.client_id !== pending.client_id || body.redirect_uri !== pending.redirect_uri || !/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier ?? '') || createHash('sha256').update(body.code_verifier ?? '').digest('base64url') !== pending.challenge) return oauthError('invalid_grant');
    } else return oauthError('unsupported_grant_type');
    const grant = pending.grant_id ? readGrant(db, pending.grant_id) : null;
    if (!grant || grant.revokedAt || grant.expiresAt <= now) return oauthError('invalid_grant');
    // Revalidate approval against current account permissions before issuing any secret.
    const actor = grantContext(db, grant, 'authorization', grant.expiresAt);
    if (!actor) { revokeGrant(db, grant, 'authority_changed'); return oauthError('invalid_grant'); }
    const { credential, ...currentActor } = actor; void credential;
    try { validateGrantAuthority(db, currentActor, grant); }
    catch { revokeGrant(db, grant, 'authority_changed'); return oauthError('invalid_grant'); }
    db.prepare("UPDATE oauth_requests SET status = 'redeemed' WHERE id = ?").run(pending.id);
    audit(db, { actorUserId: grant.userId, scopeType: 'auth', action: 'api.token.issue', outcome: 'success', metadata: { credentialId: grant.id, kind: grant.kind } });
    return tokenResponse(db, grant);
  }).immediate();
}
