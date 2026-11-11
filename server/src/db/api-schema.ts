import type Database from 'better-sqlite3';
import { createServiceIdentity, setServiceAdminResources } from './service-identities';

export function createApiSchema(db: Database.Database) {
  db.transaction(() => { db.exec(`
    CREATE TABLE IF NOT EXISTS api_grants (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('pat','device','code')), client_id TEXT,
      scopes_json TEXT NOT NULL, resources_json TEXT NOT NULL, authority_json TEXT NOT NULL,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_api_grants_user ON api_grants(user_id, created_at, id);
    CREATE TABLE IF NOT EXISTS api_service_accounts (
      id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      resources_json TEXT NOT NULL, actions_json TEXT NOT NULL, created_at TEXT NOT NULL,
      grant_id TEXT REFERENCES api_grants(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_service_accounts_owner ON api_service_accounts(owner_user_id);
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES api_grants(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN ('pat','access','refresh')),
      expires_at TEXT NOT NULL, consumed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_api_tokens_grant ON api_tokens(grant_id);
    CREATE TABLE IF NOT EXISTS oauth_clients (
      id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, redirect_uris_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oauth_requests (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('device','code')), client_id TEXT NOT NULL,
      name TEXT NOT NULL, scopes_json TEXT NOT NULL, resources_json TEXT NOT NULL,
      device_hash TEXT UNIQUE, user_code_hash TEXT UNIQUE, code_hash TEXT UNIQUE,
      redirect_uri TEXT, challenge TEXT, state TEXT,
      status TEXT NOT NULL CHECK(status IN ('pending','approved','denied','cancelled','redeemed')),
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE, grant_id TEXT REFERENCES api_grants(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL, poll_interval INTEGER NOT NULL DEFAULT 5,
      next_poll_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_oauth_requests_expiry ON oauth_requests(expires_at);
    CREATE TABLE IF NOT EXISTS api_rate_windows (
      bucket_hash TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_rate_expiry ON api_rate_windows(resets_at);
    CREATE TRIGGER IF NOT EXISTS revoke_api_credentials_after_password_change
      AFTER UPDATE OF password_hash ON users WHEN OLD.password_hash <> NEW.password_hash
      BEGIN
        INSERT INTO audit_events (id,actor_user_id,target_user_id,scope_type,action,outcome,metadata_json,created_at)
          SELECT lower(hex(randomblob(16))),NULL,NEW.id,'auth','api.connection.revoke','success',
            json_object('credentialId',id,'reason','account_security_change'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
          FROM api_grants WHERE user_id = NEW.id AND revoked_at IS NULL;
        UPDATE api_grants SET revoked_at = COALESCE(revoked_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE user_id = NEW.id;
      END;
    CREATE TRIGGER IF NOT EXISTS revoke_api_credentials_after_disable
      AFTER UPDATE OF active ON users WHEN NEW.active = 0
      BEGIN
        INSERT INTO audit_events (id,actor_user_id,target_user_id,scope_type,action,outcome,metadata_json,created_at)
          SELECT lower(hex(randomblob(16))),NULL,NEW.id,'auth','api.connection.revoke','success',
            json_object('credentialId',id,'reason','account_security_change'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
          FROM api_grants WHERE user_id = NEW.id AND revoked_at IS NULL;
        UPDATE api_grants SET revoked_at = COALESCE(revoked_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE user_id = NEW.id;
      END;
  `);
    const columns = db.pragma('table_info(api_grants)') as { name: string }[];
    if (!columns.some(column => column.name === 'actions_json')) db.exec('ALTER TABLE api_grants ADD COLUMN actions_json TEXT');
    if (!columns.some(column => column.name === 'service_account_id')) db.exec('ALTER TABLE api_grants ADD COLUMN service_account_id TEXT REFERENCES api_service_accounts(id) ON DELETE CASCADE');
    if (!(db.pragma('table_info(users)') as {name:string}[]).some(column=>column.name==='is_service_account')) {
      db.exec('ALTER TABLE users ADD COLUMN is_service_account INTEGER NOT NULL DEFAULT 0 CHECK(is_service_account IN (0,1))');
    }
    if (!(db.pragma('table_info(api_service_accounts)') as {name:string}[]).some(column=>column.name==='platform_access')) {
      db.exec('ALTER TABLE api_service_accounts ADD COLUMN platform_access INTEGER NOT NULL DEFAULT 0 CHECK(platform_access IN (0,1))');
    }
    const legacy=db.prepare(`SELECT a.id,a.name,a.owner_user_id,a.resources_json,a.created_at FROM api_service_accounts a
      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=a.id AND u.is_service_account=1)`).all() as {id:string;name:string;owner_user_id:string;resources_json:string;created_at:string}[];
    for(const account of legacy){
      createServiceIdentity(db,account.id,account.name,account.created_at);
      setServiceAdminResources(db,account.id,JSON.parse(account.resources_json) as string[],account.owner_user_id,account.created_at);
      db.prepare('UPDATE api_grants SET user_id=? WHERE service_account_id=?').run(account.id,account.id);
    }
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS protect_service_signin BEFORE UPDATE OF active,platform_role,password_hash,is_service_account ON users
      WHEN OLD.is_service_account=1 AND (NEW.active<>0 OR NEW.platform_role<>'user' OR NEW.password_hash<>OLD.password_hash OR NEW.is_service_account<>1)
      BEGIN SELECT RAISE(ABORT,'Service identities cannot sign in'); END;
      CREATE TRIGGER IF NOT EXISTS revoke_service_keys_after_owner_disable AFTER UPDATE OF active ON users WHEN NEW.active=0
      BEGIN
        INSERT INTO audit_events (id,actor_user_id,target_user_id,scope_type,action,outcome,metadata_json,created_at)
          SELECT lower(hex(randomblob(16))),NULL,NEW.id,'auth','api.connection.revoke','success',
            json_object('credentialId',g.id,'serviceAccountId',a.id,'reason','service_owner_disabled'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
          FROM api_service_accounts a JOIN api_grants g ON g.service_account_id=a.id WHERE a.owner_user_id=NEW.id AND g.revoked_at IS NULL;
        UPDATE api_grants SET revoked_at=COALESCE(revoked_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          WHERE service_account_id IN (SELECT id FROM api_service_accounts WHERE owner_user_id=NEW.id);
      END;
    `);
  })();
}
