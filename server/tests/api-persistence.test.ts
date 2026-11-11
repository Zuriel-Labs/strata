// @vitest-environment node
import { mkdtempSync, rmSync, statSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createDatabase, type DatabaseHandle } from '../src/db/database';
import { createApp } from '../src/app';
import { createSchema } from '../src/db/schema';

describe('additive credential migration and restart',()=>{
  let db:DatabaseHandle|undefined;
  let directory:string|undefined;
  afterEach(()=>{if(db?.open)db.close();if(directory)rmSync(directory,{recursive:true,force:true});});
  it('preserves existing content, reapplies schema and persists credentials, revocation and limits',async()=>{
    process.env.SEED_DATA='true';
    directory=mkdtempSync(path.join(os.tmpdir(),'strata-api-restart-'));
    const filename=path.join(directory,'strata.sqlite');
    db=await createDatabase(filename);
    expect(statSync(filename).mode & 0o777).toBe(0o600);
    const content=JSON.stringify(db.prepare('SELECT * FROM cards ORDER BY id').all());
    // Rehearse upgrade from the previous schema, then an idempotent second startup.
    db.exec('DROP TRIGGER revoke_api_credentials_after_password_change; DROP TRIGGER revoke_api_credentials_after_disable; DROP TABLE oauth_requests; DROP TABLE oauth_clients; DROP TABLE api_tokens; DROP TABLE api_grants; DROP TABLE api_rate_windows;');
    createSchema(db);createSchema(db);
    expect(JSON.stringify(db.prepare('SELECT * FROM cards ORDER BY id').all())).toBe(content);
    let app=createApp(db);
    const browser=request.agent(app);
    expect((await browser.post('/api/auth/login').send({username:'alex',password:'WorkspaceAdmin123!'})).status).toBe(200);
    const result=await browser.post('/api/connections').set('X-Strata-Intent','connections').send({name:'Persistent',scopes:['content:read'],resources:['board:b1'],expiresInDays:7,confirmation:'CREATE'});
    expect(result.status).toBe(201);
    const authorization=`Bearer ${result.body.token}`;
    db.close();chmodSync(filename,0o644);db=await createDatabase(filename);app=createApp(db);
    expect(statSync(filename).mode & 0o777).toBe(0o600);
    expect((await request(app).get('/api/v1/cards').set('Authorization',authorization)).status).toBe(200);
    const windows=JSON.stringify(db.prepare('SELECT * FROM api_rate_windows ORDER BY bucket_hash').all());
    db.close();db=await createDatabase(filename);app=createApp(db);
    expect(JSON.stringify(db.prepare('SELECT * FROM api_rate_windows ORDER BY bucket_hash').all())).toBe(windows);
    db.prepare("UPDATE api_grants SET revoked_at = ? WHERE id = ?").run(new Date().toISOString(),result.body.connection.id);
    db.close();db=await createDatabase(filename);app=createApp(db);
    expect((await request(app).get('/api/v1/cards').set('Authorization',authorization)).status).toBe(401);
    expect(db.prepare('PRAGMA integrity_check').pluck().get()).toBe('ok');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(JSON.stringify(db.prepare('SELECT * FROM cards ORDER BY id').all())).toBe(content);
  });
});
