import { apiRequest } from './api';

export interface NavigationBoard {
  boardId: string; workspaceId: string; title: string; color: string;
  starred: boolean; lastVisitedAt: string | null;
}
export interface NavigationPage { items: NavigationBoard[]; nextCursor: string | null }
export function fetchNavigation(kind: 'recent' | 'starred', cursor?: string) {
  const query = new URLSearchParams({ kind, limit: '20' });
  if (cursor) query.set('cursor', cursor);
  return apiRequest<NavigationPage>(`/api/auth/navigation?${query}`);
}
export function visitBoard(boardId: string) {
  return apiRequest<void>(`/api/auth/navigation/boards/${encodeURIComponent(boardId)}/visit`, { method: 'PUT', body: '{}' });
}
export function setPersonalStar(boardId: string, starred: boolean) {
  return apiRequest<{ boardId: string; starred: boolean }>(`/api/auth/navigation/boards/${encodeURIComponent(boardId)}/star`, { method: 'PUT', body: JSON.stringify({ starred }) });
}
