import { randomUUID } from 'node:crypto';
import express, { Router, type Request } from 'express';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import type { AuthenticatedRequest } from '../http/auth-middleware';
import { safeContentErrors } from '../http/auth-middleware';
import { ApiAuthorizationError } from './contract';
import { digest, readGrant, revokeGrant } from './credentials';
import { decideRequest, exchangeToken, newOAuthRequest, normalizeCode, oauthError, readClient, requestById, type OAuthRequest } from './oauth';
import { rateLimit, requireTls } from './rate-limit';
import { audit } from '../audit/audit-log';

const clientIdSchema = z.string().min(1).max(100);
const permissionInput = z.object({ client_id: clientIdSchema, scope: z.string().min(1).max(2000), resource: z.string().min(1).max(20000) });
export const decisionSchema = z.object({ decision: z.enum(['approve','deny']), userCode: z.string().max(32).optional(), confirmation: z.literal(true) }).strict();
const redirectUriSchema = z.string().max(2000).url().refine(value => {
  const uri = new URL(value);
  return !uri.username && !uri.password && !uri.hash && !uri.search && (uri.protocol === 'https:' || (uri.protocol === 'http:' && ['127.0.0.1','[::1]'].includes(uri.hostname)));
}, 'Use an exact HTTPS or loopback-IP callback without query, fragment or credentials.');
export const clientSchema = z.object({ name: z.string().trim().min(1).max(100), redirectUris: z.array(redirectUriSchema).min(1).max(10) }).strict();

export function publicOrigin(request: Request) {
  const deployed = !['development', 'test'].includes(process.env.NODE_ENV ?? 'development');
  const configured = process.env.STRATA_PUBLIC_ORIGIN;
  if (configured) {
    const uri = new URL(configured);
    if (uri.origin !== configured || (deployed && uri.protocol !== 'https:')) throw new Error('Invalid public origin configuration.');
    return configured;
  }
  const host = request.get('host') ?? '';
  if (deployed && !['strata.eaglepass.io','strata-canary.eaglepass.io'].includes(host)) throw new Error('Public origin must be configured.');
  return `${request.protocol}://${host}`;
}
export function createOAuthRoutes(db: Database.Database) {
  const router = Router();
  router.use(requireTls, express.urlencoded({ extended: false, limit: '32kb' }), rateLimit(db, 'oauth', 60));
  router.post('/device/authorization', rateLimit(db, 'device-start', 10), (request, response) => {
    const parsed = permissionInput.safeParse(request.body);
    if (!parsed.success) { response.status(400).json(oauthError('invalid_request')); return; }
    const client = readClient(db, parsed.data.client_id);
    if (!client) { response.status(400).json(oauthError('invalid_client')); return; }
    try {
      const pending = newOAuthRequest(db, client, 'device', parsed.data.scope, parsed.data.resource);
      const uri = `${publicOrigin(request)}/connect`;
      response.json({ device_code: pending.deviceCode, user_code: pending.userCode, verification_uri: uri, verification_uri_complete: `${uri}?user_code=${pending.userCode}`, expires_in: 600, interval: 5 });
    } catch (error) {
      if (error instanceof ApiAuthorizationError) { response.status(error.status).json(oauthError(error.code,error.message)); return; }
      throw error;
    }
  });
  router.get('/authorize', rateLimit(db, 'code-start', 10), (request, response) => {
    const parsed = permissionInput.extend({ response_type: z.literal('code'), redirect_uri: redirectUriSchema, code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code_challenge_method: z.literal('S256'), state: z.string().min(16).max(512) }).safeParse(request.query);
    if (!parsed.success) { response.status(400).json(oauthError('invalid_request')); return; }
    const input = parsed.data;
    const client = readClient(db, input.client_id);
    if (!client || !client.redirectUris.includes(input.redirect_uri)) { response.status(400).json(oauthError('invalid_request')); return; }
    try {
      const pending = newOAuthRequest(db, client, 'code', input.scope, input.resource, { redirectUri:input.redirect_uri, challenge:input.code_challenge, state:input.state });
      response.redirect(303,`/connect?request_id=${pending.id}`);
    } catch (error) {
      if (error instanceof ApiAuthorizationError) { response.status(error.status).json(oauthError(error.code,error.message)); return; }
      throw error;
    }
  });
  router.post('/token', (request, response) => {
    const parsed = z.record(z.string().max(100),z.string().max(20000)).safeParse(request.body);
    if (!parsed.success || !parsed.data.client_id) { response.status(400).json(oauthError('invalid_request')); return; }
    const result = exchangeToken(db, parsed.data);
    response.status('error' in result ? 400 : 200).json(result);
  });
  router.post('/device/cancel', (request, response) => {
    const parsed = z.object({ client_id: clientIdSchema, device_code:z.string().min(1).max(200) }).safeParse(request.body);
    if (!parsed.success) { response.status(400).json(oauthError('invalid_request')); return; }
    db.transaction(() => {
      const pending = db.prepare('SELECT * FROM oauth_requests WHERE device_hash = ? AND client_id = ?').get(digest(parsed.data.device_code), parsed.data.client_id) as OAuthRequest | undefined;
      if (!pending) return;
      db.prepare("UPDATE oauth_requests SET status = 'cancelled' WHERE id = ?").run(pending.id);
      const grant = pending.grant_id ? readGrant(db,pending.grant_id) : null;
      if (grant) revokeGrant(db,grant,'device_cancelled');
    })();
    response.status(204).send();
  });
  router.post('/revoke', (request, response) => {
    const parsed = z.object({ client_id: clientIdSchema, token: z.string().min(1).max(200), token_type_hint: z.string().optional() }).safeParse(request.body);
    if (!parsed.success) { response.status(400).json(oauthError('invalid_request')); return; }
    const id = db.prepare('SELECT grant_id FROM api_tokens WHERE token_hash = ?').pluck().get(digest(parsed.data.token));
    const grant = typeof id === 'string' ? readGrant(db,id) : null;
    if (grant?.clientId === parsed.data.client_id) db.transaction(() => revokeGrant(db,grant,'client_revocation'))();
    response.status(200).json({});
  });
  router.use(safeContentErrors);
  return router;
}

// Mounted inside the browser-session-only connection management boundary.
export function createOAuthConsentRoutes(db: Database.Database) {
  const router = Router();
  router.get('/clients', (request: AuthenticatedRequest,response) => {
    const items = db.prepare('SELECT id,name,redirect_uris_json,created_at AS createdAt FROM oauth_clients WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 100').all(request.auth!.user.id) as { id:string;name:string;redirect_uris_json:string;createdAt:string }[];
    response.json({ items:items.map(({redirect_uris_json,...item}) => ({...item,redirectUris:JSON.parse(redirect_uris_json)})) });
  });
  router.post('/clients', rateLimit(db,'client-registration',10), (request: AuthenticatedRequest,response) => {
    const parsed = clientSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({code:'CLIENT_INVALID',message:'Enter a name and exact HTTPS or loopback callback URLs without query or fragment.'}); return; }
    if (Number(db.prepare('SELECT COUNT(*) FROM oauth_clients WHERE owner_user_id = ?').pluck().get(request.auth!.user.id)) >= 100) { response.status(409).json({code:'CLIENT_LIMIT',message:'Client registration limit reached.'}); return; }
    const id = randomUUID();
    db.transaction(() => {
      db.prepare('INSERT INTO oauth_clients VALUES (?,?,?,?,?)').run(id,request.auth!.user.id,parsed.data.name,JSON.stringify(parsed.data.redirectUris),new Date().toISOString());
      audit(db,{actorUserId:request.auth!.user.id,scopeType:'auth',action:'api.client.register',outcome:'success',metadata:{clientId:id}});
    })();
    response.status(201).json({ client: {id,...parsed.data} });
  });
  router.get('/requests', rateLimit(db,'consent-lookup',5,600), (request: AuthenticatedRequest,response) => {
    const parsed = z.object({ user_code:z.string().min(1).max(32).optional(),request_id:z.string().min(1).max(100).optional() }).strict().refine(value => Boolean(value.user_code) !== Boolean(value.request_id)).safeParse(request.query);
    if (!parsed.success) { response.status(400).json({code:'REQUEST_INVALID',message:'Enter the code shown by your client.'}); return; }
    const pending = parsed.data.request_id ? requestById(db,parsed.data.request_id) : db.prepare('SELECT * FROM oauth_requests WHERE user_code_hash = ?').get(digest(normalizeCode(parsed.data.user_code ?? ''))) as OAuthRequest | undefined;
    if (!pending || pending.status !== 'pending' || pending.expires_at <= new Date().toISOString() || (pending.kind === 'device' && !parsed.data.user_code)) { response.status(404).json({code:'REQUEST_UNAVAILABLE',message:'Request unavailable, expired or already handled.'}); return; }
    response.json({request:{id:pending.id,kind:pending.kind,clientId:pending.client_id,name:pending.name,scopes:JSON.parse(pending.scopes_json),resources:JSON.parse(pending.resources_json),expiresAt:pending.expires_at,connectionExpiresAt:new Date(Date.parse(pending.created_at)+30*86400000).toISOString(),userCode:parsed.data.user_code ? normalizeCode(parsed.data.user_code).replace(/^(.{4})(.*)$/,'$1-$2') : null,redirectUri:pending.redirect_uri}});
  });
  router.post('/requests/:id/decision',rateLimit(db,'consent-decision',10),(request:AuthenticatedRequest,response) => {
    const parsed = decisionSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({code:'CONFIRMATION_REQUIRED',message:'Confirm the client, code and requested access before continuing.'}); return; }
    try { response.json(decideRequest(db,request.auth!,String(request.params.id),parsed.data.decision,parsed.data.userCode)); }
    catch(error) { if(error instanceof ApiAuthorizationError) {response.status(error.status).json({code:error.code,message:error.message});return;} throw error; }
  });
  return router;
}
