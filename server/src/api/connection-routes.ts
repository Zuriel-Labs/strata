import { createOAuthConsentRoutes } from './oauth-routes';
import { Router } from 'express';
import type Database from 'better-sqlite3';
import { requireContentAuth, safeContentErrors, type AuthenticatedRequest } from '../http/auth-middleware';
import { createGrant, issueToken, readGrant, revokeGrant } from './credentials';
import { grantSchema, ApiAuthorizationError } from './contract';
import { rateLimit, requireTls } from './rate-limit';

export function createConnectionRoutes(db: Database.Database) {
  const router = Router();
  router.use(requireTls, requireContentAuth);
  router.use((request: AuthenticatedRequest, response, next) => {
    if (request.get('Authorization') || request.auth?.credential) { response.status(403).json({ code: 'BROWSER_APPROVAL_REQUIRED', message: 'Manage connections in your browser account.' }); return; }
    if (!['GET','HEAD'].includes(request.method) && (request.get('X-Strata-Intent') !== 'connections' || (request.get('Origin') && request.get('Origin') !== `${request.protocol}://${request.get('host')}`))) {
      response.status(403).json({ code: 'BROWSER_APPROVAL_REQUIRED', message: 'Submit this action from your Strata account.' }); return;
    }
    next();
  });
  router.use(createOAuthConsentRoutes(db));
  router.get('/', (request: AuthenticatedRequest, response) => {
    const ids = db.prepare("SELECT id FROM api_grants WHERE user_id = ? ORDER BY (revoked_at IS NULL AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')) DESC, created_at DESC, id LIMIT 200").all(request.auth!.user.id) as { id: string }[];
    const items = ids.map(({ id }) => { const grant = readGrant(db, id)!; const { authority, ...safe } = grant; void authority; return safe; });
    response.json({ items });
  });
  router.post('/', rateLimit(db, 'pat-create', 10), (request: AuthenticatedRequest, response) => {
    const parsed = grantSchema.safeParse(request.body);
    if (!parsed.success) { response.status(400).json({ code: 'INPUT_INVALID', message: 'Choose a name, valid permissions, resources, expiry and confirmation.' }); return; }
    try {
      const result = db.transaction(() => {
        const grant = createGrant(db, request.auth!, parsed.data, 'pat');
        const token = issueToken(db, grant, 'pat');
        const { authority, ...connection } = grant; void authority;
        return { connection, token: token.raw };
      })();
      response.status(201).json(result);
    } catch (error) {
      if (error instanceof ApiAuthorizationError) { response.status(error.status).json({ code: error.code, message: error.message }); return; }
      throw error;
    }
  });
  router.delete('/:id', (request: AuthenticatedRequest, response) => {
    const grant = readGrant(db, String(request.params.id));
    if (!grant || grant.userId !== request.auth!.user.id) { response.status(404).json({ code: 'CONNECTION_UNAVAILABLE', message: 'Connection unavailable.' }); return; }
    db.transaction(() => revokeGrant(db, grant, 'user_revocation'))();
    response.status(204).send();
  });
  router.use(safeContentErrors);
  return router;
}
