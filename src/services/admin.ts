import type { Workspace, AdminDirectoryResponse, AdminResourcePage, AdminUserRecord, LabelPolicySettings, PageMeta } from '../types';
import { apiRequest } from './api';

export interface ManagedUserInput {
  name: string;
  initials: string;
  color: string;
  username: string;
  platformRole: 'system_admin' | 'user';
  active: boolean;
  expectedUpdatedAt?: string | null;
  workspaceAdminWorkspaceIds: string[];
  boardAdminBoardIds: string[];
  boardMemberships: Array<{ boardId: string; role: 'member' | 'observer' }>;
}

export interface DeleteManagedUserResponse {
  deletedUserId: string;
  username: string;
  removedCardAssignments: number;
  remediatedAutomationRules: number;
}

function pageQuery(input: { query?: string; page?: number; pageSize?: number }) {
  const params = new URLSearchParams();
  if (input.query) params.set('query', input.query);
  params.set('page', String(input.page ?? 1));
  params.set('pageSize', String(input.pageSize ?? 25));
  return params;
}

export function fetchAdminDirectory(input: { query?: string; page?: number; pageSize?: number } = {}) {
  return apiRequest<AdminDirectoryResponse>(`/api/admin/users?${pageQuery(input)}`);
}

export function fetchAdminUser(userId: string) {
  return apiRequest<{ user: AdminUserRecord }>(`/api/admin/users/${userId}`);
}

export function fetchAdminResources(input: { kind: 'workspace' | 'board'; query?: string; page?: number; pageSize?: number; workspaceId?: string; selectedIds?: string[] }) {
  const params = pageQuery(input);
  params.set('kind', input.kind);
  if (input.workspaceId) params.set('workspaceId', input.workspaceId);
  if (input.selectedIds?.length) params.set('selectedIds', input.selectedIds.join(','));
  return apiRequest<AdminResourcePage>(`/api/admin/resources?${params}`);
}

export function createManagedUser(input: ManagedUserInput) {
  return apiRequest<{ user: { id: string; username: string }; inviteToken: string }>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateManagedUser(userId: string, input: Partial<ManagedUserInput>) {
  return apiRequest<{ user: unknown }>(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function generateRecoveryKeyForUser(userId: string) {
  return apiRequest<{ recoveryKey: string }>(`/api/admin/users/${userId}/generate-recovery-key`, {
    method: 'POST',
  });
}

export function deleteManagedUser(userId: string) {
  return apiRequest<DeleteManagedUserResponse>(`/api/admin/users/${userId}`, {
    method: 'DELETE',
  });
}

export interface AdminPerson {
  id: string; name: string; username: string; initials: string; color: string; role?: 'member' | 'observer';
}
export interface AdminPeoplePage { items: AdminPerson[]; page: PageMeta }

export function fetchBoardMembers(boardId: string, input: { query?: string; page?: number; pageSize?: number } = {}) {
  return apiRequest<AdminPeoplePage>(`/api/admin/boards/${boardId}/members?${pageQuery(input)}`);
}

export function fetchEligibleBoardUsers(boardId: string, input: { query?: string; page?: number; pageSize?: number } = {}) {
  return apiRequest<AdminPeoplePage>(`/api/admin/boards/${boardId}/eligible-users?${pageQuery(input)}`);
}

export function setBoardMember(boardId: string, userId: string, role: 'member' | 'observer') {
  return apiRequest<{ membership: unknown }>(`/api/admin/boards/${boardId}/members/${userId}`, { method: 'PUT', body: JSON.stringify({ role }) });
}

export function removeBoardMember(boardId: string, userId: string) {
  return apiRequest<{ userId: string; boardId: string; derivedWorkspaceIds: string[] }>(`/api/admin/boards/${boardId}/members/${userId}`, { method: 'DELETE' });
}

export function updateLabelPolicy(maxLabelsPerBoard: number) {
  return apiRequest<LabelPolicySettings>('/api/admin/settings/label-policy', {
    method: 'PATCH',
    body: JSON.stringify({ maxLabelsPerBoard }),
  });
}

export function createWorkspace(input: { name: string; description: string; visibility: string }) {
  return apiRequest<{ id: string; name: string; description: string; visibility: string }>('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateWorkspace(workspaceId: string, input: { name: string }) {
  return apiRequest<Workspace>(`/api/workspaces/${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteWorkspace(workspaceId: string) {
  return apiRequest<{ success: boolean }>(`/api/workspaces/${workspaceId}`, {
    method: 'DELETE',
  });
}
