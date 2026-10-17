import { apiRequest } from './api';
import type { PageMeta } from '../types';

export interface BoardInvitation {
  id: string; boardId: string; targetUserId: string; role: 'member' | 'observer'; expiresAt: string; status: 'pending';
  targetName?: string; targetUsername?: string;
}
export function createBoardInvitation(boardId: string, targetUserId: string, role: 'member' | 'observer', expiresAt: string) {
  return apiRequest<{ invitation: BoardInvitation; token: string }>(`/api/admin/boards/${encodeURIComponent(boardId)}/invitations`, { method: 'POST', body: JSON.stringify({ targetUserId, role, expiresAt }) });
}
export function fetchBoardInvitations(boardId: string, page = 1) {
  return apiRequest<{ items: BoardInvitation[]; page: PageMeta }>(`/api/admin/boards/${encodeURIComponent(boardId)}/invitations?status=pending&page=${page}&pageSize=20`);
}
export function revokeBoardInvitation(boardId: string, invitationId: string) {
  return apiRequest<void>(`/api/admin/boards/${encodeURIComponent(boardId)}/invitations/${encodeURIComponent(invitationId)}`, { method: 'DELETE' });
}
export function acceptBoardInvitation(token: string) {
  return apiRequest<{ boardId: string; membershipRole: 'member' | 'observer'; alreadyAccepted: boolean }>('/api/auth/board-invitations/accept', { method: 'POST', body: JSON.stringify({ token }) });
}
