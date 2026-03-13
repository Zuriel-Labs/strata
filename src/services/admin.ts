import type { AdminDirectoryResponse } from '../types';
import { apiRequest } from './api';

export interface ManagedUserInput {
  name: string;
  initials: string;
  color: string;
  email: string;
  platformRole: 'system_admin' | 'user';
  active: boolean;
  workspaceMemberships: Array<{ workspaceId: string; role: string }>;
  boardMemberships: Array<{ boardId: string; role: string }>;
}

export function fetchAdminDirectory() {
  return apiRequest<AdminDirectoryResponse>('/api/admin/users');
}

export function createManagedUser(input: ManagedUserInput) {
  return apiRequest<{ user: unknown; temporaryPassword: string }>('/api/admin/users', {
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

export function resetManagedUserPassword(userId: string) {
  return apiRequest<{ temporaryPassword: string }>(`/api/admin/users/${userId}/reset-password`, {
    method: 'POST',
  });
}
