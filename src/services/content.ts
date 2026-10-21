import type { OperationInput, OperationCommit } from '../../server/src/content/operation-contract';
import { apiRequest } from './api';

export type ContentOperationDraft = Pick<OperationInput, 'kind' | 'sourceId'> & Partial<Omit<OperationInput, 'kind' | 'sourceId'>>;
export interface ContentPreview {
  planHash: string;
  sourceRevision: number;
  destinationRevision: number | null;
  counts: Record<string, number>;
  warnings: string[];
  unresolvedMappings: { kind: 'label' | 'member'; sourceId: string }[];
  expiresAt: string;
  audience?: Record<string, { id: string; name: string }[]>;
}
export interface ContentResult { operationId: string; resultIds: string[]; counts: Record<string, number>; replayed: boolean; sessionsInvalidated?: boolean; tombstoneId?: string }
export function previewContentOperation(input: ContentOperationDraft) {
  return apiRequest<ContentPreview>('/api/content-operations/preview', { method: 'POST', body: JSON.stringify(input) });
}
export function commitContentOperation(input: ContentOperationDraft & Pick<OperationCommit, 'planHash' | 'confirmation'>, key: string) {
  return apiRequest<ContentResult>('/api/content-operations', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) });
}
export function setLifecycle(kind: 'workspaces' | 'boards', id: string, action: 'close' | 'reopen', expectedRevision: number) {
  return apiRequest<{ id: string; lifecycleState: 'active' | 'closed'; revision: number }>(`/api/${kind}/${id}/${action}`, { method: 'POST', body: JSON.stringify({ expectedRevision }) });
}
export function setBoardTemplate(id: string, isTemplate: boolean, expectedRevision: number) {
  return apiRequest(`/api/boards/${id}/template`, { method: 'PUT', body: JSON.stringify({ isTemplate, expectedRevision }) });
}
export function setListCollapsed(id: string, collapsed: boolean) {
  return apiRequest(`/api/auth/list-preferences/${id}`, { method: 'PUT', body: JSON.stringify({ collapsed }) });
}
export function setListColor(id: string, color: string | null, expectedRevision: number) {
  return apiRequest(`/api/lists/${id}/presentation`, { method: 'PATCH', body: JSON.stringify({ color, expectedRevision }) });
}
