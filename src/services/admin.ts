import type { AdminDirectoryResponse } from '../types';
import { apiRequest } from './api';

export interface ManagedUserInput {
  name: string;
  initials: string;
  color: string;
  username: string;
  platformRole: 'system_admin' | 'user';
  active: boolean;
  workspaceMemberships: Array<{ workspaceId: string; role: string }>;
  boardMemberships: Array<{ boardId: string; role: string }>;
}

export function fetchAdminDirectory() {
  return apiRequest<AdminDirectoryResponse>('/api/admin/users');
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

export function createWorkspace(input: { name: string; description: string; visibility: string }) {
  return apiRequest<{ id: string; name: string; description: string; visibility: string }>('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
