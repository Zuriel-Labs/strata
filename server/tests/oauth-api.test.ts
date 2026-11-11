// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { createDatabase, type DatabaseHandle } from '../src/db/database';
import { createApp } from '../src/app';

describe('public client OAuth', () => {
  let db: DatabaseHandle;
  let app: ReturnType<typeof createApp>;
  beforeEach(async () => { process.env.SEED_DATA = 'true'; db = await createDatabase(':memory:'); app = createApp(db); });
  afterEach(() => db.close());
  async function browser() {
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ username: 'alex', password: 'WorkspaceAdmin123!' })).status).toBe(200);
    return agent;
  }
  const deviceInput = { client_id: 'strata-cli', scope: 'content:read content:write', resource: 'board:b1' };
  const poll = (device_code: string) => request(app).post('/api/oauth/token').type('form').send({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'strata-cli', device_code });
  const ready = () => db.prepare("UPDATE oauth_requests SET next_poll_at = '2000-01-01T00:00:00.000Z'").run();
  async function approvedDevice() {
    const agent = await browser();
    const started = await request(app).post('/api/oauth/device/authorization').type('form').send(deviceInput);
    expect(started.status).toBe(200);
    expect(started.body.user_code).toMatch(/^[A-Z]{4}-[A-Z]{4}$/);
    const inspected = await agent.get('/api/connections/requests').query({ user_code: started.body.user_code });
    expect(inspected.status).toBe(200);
    expect(inspected.body.request.scopes).toEqual(['content:read','content:write']);
    expect((await agent.post(`/api/connections/requests/${inspected.body.request.id}/decision`).set('X-Strata-Intent','connections').send({ decision:'approve', userCode:started.body.user_code, confirmation:true })).status).toBe(200);
    const connections=await agent.get('/api/connections');
    expect(connections.body.items[0].expiresAt).toBe(inspected.body.request.connectionExpiresAt);
    ready();
    return { agent, started };
  }
  it('requires matching-code approval, issues no browser cookie and detects refresh replay', async () => {
    const { started } = await approvedDevice();
    const issued = await poll(started.body.device_code);
    expect(issued.status).toBe(200);
    expect(issued.body.expires_in).toBeLessThanOrEqual(600);
    expect(issued.headers['set-cookie']).toBeUndefined();
    expect((await poll(started.body.device_code)).body.error).toBe('invalid_grant');
    expect((await request(app).get('/api/v1/cards').set('Authorization',`Bearer ${issued.body.access_token}`)).status).toBe(200);
    const renew = (token: string) => request(app).post('/api/oauth/token').type('form').send({ grant_type:'refresh_token', client_id:'strata-cli', refresh_token:token });
    const rotated = await renew(issued.body.refresh_token);
    expect(rotated.status).toBe(200);
    expect(rotated.body.refresh_token).not.toBe(issued.body.refresh_token);
    expect((await renew(issued.body.refresh_token)).body.error).toBe('invalid_grant');
    expect((await request(app).get('/api/v1/cards').set('Authorization',`Bearer ${rotated.body.access_token}`)).status).toBe(401);
    expect((await renew(rotated.body.refresh_token)).status).toBe(400);
    const state = JSON.stringify(db.prepare('SELECT * FROM api_tokens').all()) + JSON.stringify(db.prepare('SELECT * FROM audit_events').all()) + JSON.stringify(db.prepare('SELECT * FROM oauth_requests').all());
    for (const value of [issued.body.access_token, issued.body.refresh_token, started.body.device_code, started.body.user_code]) expect(state).not.toContain(value);
  });
  it('handles pending, slow polling, denial, expiry, cancellation and invalid approval', async () => {
    const agent = await browser();
    const started = await request(app).post('/api/oauth/device/authorization').send(deviceInput);
    expect(started.status).toBe(200);
    ready();
    expect((await poll(started.body.device_code)).body.error).toBe('authorization_pending');
    const early = await poll(started.body.device_code);
    expect(early.body.error).toBe('slow_down');
    const inspected = await agent.get('/api/connections/requests').query({ user_code:started.body.user_code });
    const decision = (body: object) => agent.post(`/api/connections/requests/${inspected.body.request.id}/decision`).set('X-Strata-Intent','connections').send(body);
    expect((await decision({ decision:'approve',userCode:'WRNG-CODE',confirmation:true })).status).toBe(400);
    expect((await decision({ decision:'deny',userCode:started.body.user_code,confirmation:true })).status).toBe(200);
    expect((await poll(started.body.device_code)).body.error).toBe('access_denied');
    const cancelled = await request(app).post('/api/oauth/device/authorization').send(deviceInput);
    expect((await request(app).post('/api/oauth/device/cancel').send({ client_id:'strata-cli',device_code:cancelled.body.device_code })).status).toBe(204);
    expect((await poll(cancelled.body.device_code)).body.error).toBe('access_denied');
    db.prepare("UPDATE oauth_requests SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect((await poll(cancelled.body.device_code)).body.error).toBe('expired_token');
  });
  it('serializes device redemption and revokes the winner after concurrent refresh reuse', async () => {
    const {started}=await approvedDevice();
    const redeemed=await Promise.all([poll(started.body.device_code),poll(started.body.device_code)]);
    expect(redeemed.map(result=>result.status).sort()).toEqual([200,400]);
    const issued=redeemed.find(result=>result.status===200)!;
    const renew=()=>request(app).post('/api/oauth/token').send({grant_type:'refresh_token',client_id:'strata-cli',refresh_token:issued.body.refresh_token});
    const rotated=await Promise.all([renew(),renew()]);
    expect(rotated.map(result=>result.status).sort()).toEqual([200,400]);
    const winner=rotated.find(result=>result.status===200)!;
    expect((await request(app).get('/api/v1/cards').set('Authorization',`Bearer ${winner.body.access_token}`)).status).toBe(401);
  });
  it('refuses renewal escalation, wrong clients, removed authority and revoked approval', async () => {
    const {started,agent}=await approvedDevice();
    const issued=await poll(started.body.device_code);
    const body={grant_type:'refresh_token',client_id:'strata-cli',refresh_token:issued.body.refresh_token};
    expect((await request(app).post('/api/oauth/token').send({...body,client_id:'foreign'})).body.error).toBe('invalid_grant');
    expect((await request(app).post('/api/oauth/token').send({...body,scope:'administration:write'})).body.error).toBe('invalid_scope');
    expect((await request(app).post('/api/oauth/token').send({...body,resource:'platform'})).body.error).toBe('invalid_scope');
    db.prepare("DELETE FROM workspace_admin_grants WHERE user_id = 'u2'").run();
    expect((await request(app).post('/api/oauth/token').send(body)).body.error).toBe('invalid_grant');
    expect((await request(app).get('/api/v1/cards').set('Authorization',`Bearer ${issued.body.access_token}`)).status).toBe(401);
    expect((await agent.get('/api/connections')).body.items[0].revokedAt).toBeTruthy();
  });
  it('invalidates password-changed connections without creating an API browser session', async () => {
    const agent=await browser();
    const personal=await agent.post('/api/connections').set('X-Strata-Intent','connections').send({name:'Password change',scopes:['account:security'],resources:['account'],expiresInDays:7,confirmation:'CREATE'});
    const authorization=`Bearer ${personal.body.token}`;
    const sessions=db.prepare('SELECT COUNT(*) FROM sessions').pluck().get();
    expect((await request(app).post('/api/v1/auth/password/change').set('Authorization',authorization).send({currentPassword:'Wrong',nextPassword:'NewPassword123!',confirmPassword:'NewPassword123!'})).status).toBe(401);
    const changed=await request(app).post('/api/v1/auth/password/change').set('Authorization',authorization).send({currentPassword:'WorkspaceAdmin123!',nextPassword:'NewPassword123!',confirmPassword:'NewPassword123!'});
    expect(changed.status).toBe(204);
    expect(changed.headers['set-cookie']).toBeUndefined();
    expect(Number(db.prepare('SELECT COUNT(*) FROM sessions').pluck().get())).toBeLessThan(Number(sessions));
    expect((await request(app).post('/api/v1/auth/recovery-key/generate').set('Authorization',authorization)).status).toBe(401);
  });
  it('binds authorization codes to a registered redirect and S256 proof', async () => {
    const agent = await browser();
    const client = await agent.post('/api/connections/clients').set('X-Strata-Intent','connections').send({ name:'Local client',redirectUris:['http://127.0.0.1:8765/callback'] });
    expect(client.status).toBe(201);
    const verifier = 'A'.repeat(64);
    const query = { client_id:client.body.client.id, response_type:'code', redirect_uri:'http://127.0.0.1:8765/callback', scope:'content:read',resource:'board:b1', state:'state-with-enough-entropy', code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256' };
    expect((await request(app).get('/api/oauth/authorize').query({...query,redirect_uri:'https://attacker.invalid/callback'})).status).toBe(400);
    const started = await request(app).get('/api/oauth/authorize').query(query);
    expect(started.status).toBe(303);
    const requestId = new URL(started.headers.location,'https://strata.invalid').searchParams.get('request_id');
    const inspected = await agent.get('/api/connections/requests').query({ request_id:requestId });
    expect(inspected.status).toBe(200);
    const approved = await agent.post(`/api/connections/requests/${requestId}/decision`).set('X-Strata-Intent','connections').send({decision:'approve',confirmation:true});
    expect(approved.status).toBe(200);
    const callback = new URL(approved.body.redirectUri);
    expect(callback.searchParams.get('state')).toBe(query.state);
    const exchange = (code_verifier: string) => request(app).post('/api/oauth/token').type('form').send({grant_type:'authorization_code',client_id:client.body.client.id,redirect_uri:query.redirect_uri,code:callback.searchParams.get('code'),code_verifier});
    expect((await exchange('B'.repeat(64))).status).toBe(400);
    const issued = await exchange(verifier);
    expect(issued.status).toBe(200);
    expect(issued.body.scope).toBe('content:read');
    expect((await exchange(verifier)).body.error).toBe('invalid_grant');
  });
});
