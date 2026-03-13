import type Database from 'better-sqlite3';
import { createAuditEvent } from '../db/repositories';
import type { AuditEventInput } from '../types';

export function audit(db: Database.Database, input: AuditEventInput) {
  createAuditEvent(db, input);
}
