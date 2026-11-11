// @vitest-environment node
import { createHash } from 'node:crypto';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createDatabase, type DatabaseHandle } from '../src/db/database';
import { createApp } from '../src/app';
import { API_OPERATIONS } from '../src/api/operations';

const methods = new Set(['get','post','put','patch','delete','head','options','trace']);
const canonical = (path: string) => path.replace(/\/:\w+|\/\{[^}]+\}/g,'/{}').replace(/\/$/,'');
const key = (method:string, path:string) => `${method.toUpperCase()} ${canonical(path)}`;

interface RouteLayer {
  route?: { path:string|string[]; methods:Record<string,boolean> };
  handle: RouterStack;
}
interface RouterStack { stack:RouteLayer[]; use(...args:unknown[]):unknown }

// Express 5 hides mount strings in Layer matcher closures. Record the actual
// arguments as createApp registers layers, then walk that same application's stack.
function registeredRoutes(db:DatabaseHandle) {
  const prefixes=new WeakMap<RouteLayer,string[]>();
  let prototype=Object.getPrototypeOf(express.Router()) as RouterStack;
  while(!Object.hasOwn(prototype,'use')) prototype=Object.getPrototypeOf(prototype) as RouterStack;
  const original=prototype.use;
  const use=vi.spyOn(prototype,'use').mockImplementation(function(this:RouterStack,...args) {
    const start=this.stack.length;
    const first=args[0];
    const paths=typeof first==='string' ? [first] : Array.isArray(first) && first.every(value=>typeof value==='string') ? first : ['/'];
    const result=Reflect.apply(original,this,args);
    for(const layer of this.stack.slice(start)) if(Array.isArray(layer.handle.stack)) prefixes.set(layer,paths);
    return result;
  });
  try {
    const app=createApp(db);
    const routes:string[]=[];
    const walk=(router:RouterStack,prefix:string) => {
      for (const layer of router.stack) {
        if (layer.route) {
          for (const path of [layer.route.path].flat()) {
            for (const [method,active] of Object.entries(layer.route.methods)) if (active) routes.push(key(method,prefix+path));
          }
        } else if (Array.isArray(layer.handle.stack)) {
          const mounts=prefixes.get(layer);
          if (!mounts) throw new Error('Unexpected Express router mount without a recorded prefix');
          for(const mount of mounts) walk(layer.handle,prefix+mount.replace(/\/$/,''));
        }
      }
    };
    walk(app.router as unknown as RouterStack,'');
    return {app,routes};
  } finally { use.mockRestore(); }
}

const infrastructure:Record<string,string> = {
  'GET /api/health':'Platform health probe.',
  'GET /api/docs':'Human documentation surface.',
  'GET /api/docs/style.css':'Reference stylesheet.',
  'GET /api/docs/reference.js':'Reference application module.',
  'GET /api/docs/contract.js':'Reference contract module.',
  'GET /api/v1/openapi.json':'The inventory document itself.',
};
const gatedLifecycleAliases:Record<string,string> = Object.fromEntries([
  'GET /api/v1/auth/needs-bootstrap','POST /api/v1/auth/bootstrap','POST /api/v1/auth/login','POST /api/v1/auth/recovery-key/consume',
].map(route=>[route,'Shared router registration; v1 bearer operation allowlist rejects this alias. Browser route is published.']));

describe('supported API contract', () => {
  let db: DatabaseHandle;
  beforeEach(async () => { process.env.SEED_DATA='true'; db=await createDatabase(':memory:'); });
  afterEach(() => db.close());
  it('matches both directions against the actual registered application, with explicit exclusions', async () => {
    const {app,routes}=registeredRoutes(db);
    const response=await request(app).get('/api/v1/openapi.json');
    expect(response.status).toBe(200);
    const publishedKeys=Object.entries(response.body.paths as Record<string,Record<string,unknown>>)
      .flatMap(([path,item])=>Object.keys(item).filter(method=>methods.has(method)).map(method=>key(method,path)));
    const published=new Set(publishedKeys);
    const registered=new Set(routes);
    const exclusions:Record<string,string>={};
    const undocumented:string[]=[];
    for(const route of registered) {
      if(published.has(route)) continue;
      const equivalent=route.replace(' /api/',' /api/v1/');
      const reason=infrastructure[route]??gatedLifecycleAliases[route]??
        (equivalent!==route && published.has(equivalent)?`Browser session alias of ${equivalent}; unversioned requests reject Authorization.`:undefined);
      if(reason) exclusions[route]=reason;
      else undocumented.push(route);
    }
    const missing=[...published].filter(route=>!registered.has(route));
    const staleExclusions=[...Object.keys(infrastructure),...Object.keys(gatedLifecycleAliases)]
      .filter(route=>!Object.hasOwn(exclusions,route));
    const duplicates=[...registered].filter(route=>routes.filter(item=>item===route).length>1).sort();
    // Versioned read/logout handlers intentionally precede their shared Web UI counterparts.
    expect(duplicates).toEqual(['GET /api/v1/auth/session','GET /api/v1/workspaces/bootstrap','POST /api/v1/auth/logout','POST /api/v1/notifications/read-all']);
    console.info('API route inventory', JSON.stringify({
      registered:registered.size, registrations:routes.length, published:published.size,
      excluded:Object.keys(exclusions).length, infrastructure:Object.keys(infrastructure), gatedLifecycleAliases:Object.keys(gatedLifecycleAliases),
      sessionAliases:Object.keys(exclusions).filter(route=>!Object.hasOwn(infrastructure,route)&&!Object.hasOwn(gatedLifecycleAliases,route)).length,
      missing, undocumented, staleExclusions,
    }));
    expect({missing,undocumented,staleExclusions}).toEqual({missing:[],undocumented:[],staleExclusions:[]});
    expect(published.size).toBe(publishedKeys.length);
  });
  it('publishes shared input schemas, permissions, errors, pages and public-client discovery', async () => {
    const app=createApp(db);
    const response=await request(app).get('/api/v1/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.1.0');
    expect(response.headers['x-strata-contract-sha256']).toBe(createHash('sha256').update(response.text).digest('hex'));
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.paths['/api/auth/recovery-key/consume'].post.responses['200'].content['application/json'].schema.required).toEqual(['newRecoveryKey']);
    expect(response.body.paths['/api/connections'].post.security).toEqual([{browserSession:[]}]);
    expect(response.body.paths['/api/v1/workspaces'].post['x-role-policy']).toBe('Current System Admin');
    expect(response.body.paths['/api/v1/boards/{id}'].get['x-role-policy']).toBeUndefined();
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
    const docs=await request(app).get('/api/docs');
    expect(docs.status).toBe(200);
    expect(docs.headers['content-security-policy']).toContain("script-src 'self'");
    expect(docs.text).toContain('/api/docs/reference.js');
    for (const asset of ['style.css','reference.js','contract.js']) {
      expect((await request(app).get('/api/docs/'+asset)).status).toBe(200);
    }
    expect((await request(app).get('/api/v1/me')).status).toBe(401);
    expect((await request(app).get('/api/connections')).status).toBe(401);
  });
});
