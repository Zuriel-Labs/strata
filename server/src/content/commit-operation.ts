import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AuthContextValue } from '../types';
import { revalidateAuthContext } from '../http/auth-middleware';
import { createAuditEvent } from '../db/repositories';
import { ContentOperationError, conflict, operationSchema, type OperationCommit } from './operation-contract';
import { hash, resolveOperation, verifyPlan } from './operation-plan';
import { copyContent } from './copy-content';
import { moveContent } from './move-content';
import { deleteContent, deletionImpact } from './delete-content';

interface OperationResult {
  operationId: string;
  resultIds: string[];
  counts: Record<string, number>;
  createdCardIds: string[];
  replayed: boolean;
  resources: Record<string, unknown>[];
}

export function commitOperation(db: Database.Database, suppliedActor: AuthContextValue, key: string, body: OperationCommit) {
  return db.transaction(() => {
    const actor = revalidateAuthContext(db, suppliedActor);
    if (!actor || actor.user.mustChangePassword) throw new ContentOperationError(401, 'AUTHENTICATION_REQUIRED', 'Sign in again before continuing.');
    const { planHash, confirmation, ...rawInput } = body;
    const input = operationSchema.parse(rawInput);
    const requestHash = hash({ input, planHash, confirmation });
    // Receipts belong to the approved connection, including after a deleted resource is gone.
    const receiptKey = actor.credential ? `api:${actor.credential.id}:${key}` : key;
    const receipt = db.prepare('SELECT request_hash, result_json, http_status FROM content_operations WHERE actor_user_id = ? AND idempotency_key = ?').get(actor.user.id, receiptKey) as { request_hash: string; result_json: string; http_status: number } | undefined;
    if (receipt) {
      if (receipt.request_hash !== requestHash) conflict('OPERATION_KEY_CONFLICT', 'This operation key was already used with another request.');
      if (input.kind === 'delete') {
        // An authenticated actor may read their own content-free deletion receipt after its graph is gone.
        if (!db.prepare('SELECT 1 FROM lifecycle_tombstones WHERE operation_id = ? AND actor_user_id = ?').get((JSON.parse(receipt.result_json) as OperationResult).operationId, actor.user.id)) conflict('REVISION_CONFLICT', 'Deletion receipt unavailable.');
      } else resolveOperation(db, actor, input, true);
      return { status: receipt.http_status, result: { ...JSON.parse(receipt.result_json) as OperationResult, replayed: true } };
    }
    const plan = resolveOperation(db, actor, input);
    if (input.kind === 'delete') {
      if (confirmation !== 'DELETE') throw new ContentOperationError(400, 'INPUT_INVALID', 'Type DELETE to confirm permanent deletion.');
      Object.assign(plan.counts, deletionImpact(db, plan));
    }
    verifyPlan(db, actor, input, planHash, plan);
    const operationId = randomUUID();
    const copied = plan.isCopy ? copyContent(db, actor.user.id, operationId, input, plan) : plan.isMove ? moveContent(db, actor.user.id, operationId, input, plan) : deleteContent(db, actor.user.id, operationId, input, plan);
    const resources: Record<string, unknown>[] = [];
    if (input.kind !== 'delete') {
      const table = plan.resourceType === 'board' ? 'boards' : plan.resourceType === 'list' ? 'lists' : 'cards';
      for (const id of copied.resultIds) {
        const row = db.prepare(`SELECT revision FROM ${table} WHERE id = ?`).get(id) as { revision: number } | undefined;
        if (row) resources.push({ type: plan.resourceType, id, revision: row.revision });
      }
      for (const id of new Set([...copied.createdCardIds, ...(!plan.isCopy ? plan.cards.map(card => card.id) : [])])) {
        const row = db.prepare('SELECT id, revision, board_id AS boardId, list_id AS listId, position, archived, due_date_complete AS dueDateComplete FROM cards WHERE id = ?').get(id) as Record<string, unknown> | undefined;
        if (row) resources.push({ type: 'card', ...row, archived: Boolean(row.archived), dueDateComplete: Boolean(row.dueDateComplete) });
      }
    }
    const result: OperationResult = { operationId, ...copied, counts: plan.counts, resources, replayed: false };
    createAuditEvent(db, { actorUserId: actor.user.id, scopeType: plan.resourceType === 'workspace' ? 'workspace' : 'board', scopeId: plan.destinationBoard?.id ?? plan.sourceBoard?.id ?? plan.sourceWorkspace.id, action: plan.isCopy ? 'content.copy' : plan.isMove ? 'content.move' : 'content.delete', outcome: 'success', metadata: { operationId, sourceId: input.sourceId, counts: plan.counts } });
    const status = plan.isCopy ? 201 : 200;
    db.prepare('INSERT INTO content_operations (id, actor_user_id, idempotency_key, request_hash, kind, result_json, http_status, committed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(operationId, actor.user.id, receiptKey, requestHash, input.kind, JSON.stringify(result), status, new Date().toISOString());
    return { status, result };
  }).immediate();
}
