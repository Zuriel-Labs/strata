// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase, type DatabaseHandle } from '../src/db/database';
import { createApp } from '../src/app';
import { API_OPERATIONS } from '../src/api/operations';
import { createAuthRoutes } from '../src/routes/auth-routes';
import { createAdminRoutes } from '../src/routes/admin-routes';
import { createBootstrapRoutes } from '../src/routes/bootstrap-routes';
import { createBoardRoutes } from '../src/routes/board-routes';
import { createListRoutes } from '../src/routes/list-routes';
import { createCardRoutes } from '../src/routes/card-routes';
import { createAutomationRoutes, createNotificationRoutes } from '../src/routes/automation-routes';
import { createLifecycleRoutes } from '../src/routes/lifecycle-routes';
import { createContentOperationRoutes } from '../src/routes/content-operation-routes';
import { createPresentationRoutes } from '../src/routes/presentation-routes';
import { createNavigationRoutes } from '../src/routes/navigation-routes';
import { createAdminInvitationRoutes, createRecipientInvitationRoutes } from '../src/routes/invitation-routes';

const canonical = (path: string) => path.replace(/\/:\w+/g,'/{}').replace(/\/$/,'');
describe('supported API contract', () => {
  let db: DatabaseHandle;
  beforeEach(async () => { process.env.SEED_DATA='true'; db=await createDatabase(':memory:'); });
  afterEach(() => db.close());
  it('inventories every server-backed UI operation with a versioned equivalent or explicit browser authentication flow', () => {
    const browserOnly = new Set(['GET /auth/needs-bootstrap','POST /auth/bootstrap','POST /auth/login','POST /auth/recovery-key/consume']);
    const supported = new Set(API_OPERATIONS.map(item => `${item.method} ${canonical(item.path)}`));
    const routers = [
      ['/auth',createAuthRoutes(db)],['/admin',createAdminRoutes(db)],['/workspaces',createBootstrapRoutes(db)],['/boards',createBoardRoutes(db)],['/lists',createListRoutes(db)],['/cards',createCardRoutes(db)],['/automation-rules',createAutomationRoutes(db)],['/notifications',createNotificationRoutes(db)],['',createLifecycleRoutes(db)],['/content-operations',createContentOperationRoutes(db)],['',createPresentationRoutes(db)],['/auth/navigation',createNavigationRoutes(db)],['/admin',createAdminInvitationRoutes(db)],['/auth',createRecipientInvitationRoutes(db)],
    ] as const;
    const missing:string[]=[];
    for(const [prefix,router] of routers) for(const layer of router.stack) {
      const route=layer.route;
      if (!route) continue;
      for(const method of route.stack.map(handler=>handler.method)) {
        const operation=`${method.toUpperCase()} ${canonical(`${prefix}${route.path}`)}`;
        if(!browserOnly.has(operation) && !supported.has(operation)) missing.push(operation);
      }
    }
    expect(missing).toEqual([]);
    expect(supported.size).toBe(API_OPERATIONS.length);
  });
  it('publishes shared input schemas, permissions, errors, pages and public-client discovery', async () => {
    const app=createApp(db);
    const response=await request(app).get('/api/v1/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.1.0');
    for(const operation of API_OPERATIONS) {
      const path=`/api/v1${operation.path.replace(/:(\w+)/g,'{$1}')}`;
      const documented=response.body.paths[path][operation.method.toLowerCase()];
      expect(documented['x-required-scopes']).toEqual(operation.scopes);
      expect(documented.responses['429'].headers['Retry-After']).toBeTruthy();
      if(operation.body) expect(documented.requestBody.content['application/json'].schema).toBeTruthy();
    }
    for(const [path,method] of [['/api/connections/{id}','delete'],['/api/connections/clients','get'],['/api/connections/clients','post'],['/api/connections/requests','get'],['/api/connections/requests/{id}/decision','post'],['/api/auth/needs-bootstrap','get'],['/api/auth/bootstrap','post'],['/api/auth/login','post'],['/api/auth/recovery-key/consume','post']]) {
      expect(response.body.paths[path]?.[method]?.responses).toBeTruthy();
    }
    expect(response.body.paths['/api/v1/workspaces/{id}/collections'].get.parameters.map((item:{name:string})=>item.name)).toContain('cursor');
    const discovery=await request(app).get('/.well-known/oauth-authorization-server');
    expect(discovery.status).toBe(200);
    expect(discovery.body.code_challenge_methods_supported).toEqual(['S256']);
    expect(discovery.body.token_endpoint_auth_methods_supported).toEqual(['none']);
    expect(discovery.body.grant_types_supported).not.toContain('password');
    expect((await request(app).get('/api/docs')).text).toContain('color-scheme:dark');
  });
});
