import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { createSchema } from './schema';
import { seedIfNeeded } from '../seed/bootstrap';

export type DatabaseHandle = BetterSqlite3.Database;

let singleton: DatabaseHandle | null = null;

export async function createDatabase(filename?: string) {
  const targetFile = filename ?? process.env.STRATA_DB_FILE ?? path.resolve(process.cwd(), 'server/data/strata.sqlite');
  if (targetFile !== ':memory:') {
    fs.mkdirSync(path.dirname(targetFile), { recursive: true, mode: 0o700 });
    // Restrict both new and existing credential-bearing databases to the service user.
    fs.closeSync(fs.openSync(targetFile, 'a', 0o600));
    fs.chmodSync(targetFile, 0o600);
  }
  const db = new BetterSqlite3(targetFile);
  createSchema(db);
  await seedIfNeeded(db);
  return db;
}

export async function getDatabase(filename?: string) {
  if (filename) return createDatabase(filename);
  if (!singleton) singleton = await createDatabase();
  return singleton;
}

export function closeDatabase() {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}
