import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { expect } from 'vitest';

export async function reviewedDelete(agent: Pick<ReturnType<typeof request.agent>, 'post' | 'patch'>, db: Database.Database, resourceType: 'workspace' | 'board' | 'list' | 'card', sourceId: string) {
  if (resourceType === 'workspace' || resourceType === 'board') {
    const table = resourceType === 'workspace' ? 'workspaces' : 'boards';
    const revision = db.prepare(`SELECT revision FROM ${table} WHERE id = ?`).pluck().get(sourceId);
    expect((await agent.post(`/api/${table}/${sourceId}/close`).send({ expectedRevision: revision })).status).toBe(200);
  } else if (resourceType === 'list') expect((await agent.post(`/api/lists/${sourceId}/archive`).send({})).status).toBe(200);
  else expect((await agent.patch(`/api/cards/${sourceId}`).send({ archived: true })).status).toBe(200);
  const input = { kind: 'delete', resourceType, sourceId };
  const preview = await agent.post('/api/content-operations/preview').send(input);
  expect(preview.status).toBe(200);
  return agent.post('/api/content-operations').set('Idempotency-Key', randomUUID()).send({ ...input, planHash: preview.body.planHash, confirmation: 'DELETE' });
}
