import type { Board, List, Card, AutomationRule, Label } from '../types';
import type { CardSortDirection } from '../lib/card-sort';
import { apiRequest } from './api';

// ── Board API ────────────────────────────────────────────────────────
export function createBoardApi(input: { workspaceId: string; title: string; color: string }) {
  return apiRequest<Board>('/api/boards', { method: 'POST', body: JSON.stringify(input) });
}

export function toggleBoardStarApi(boardId: string) {
  return apiRequest<{ starred: boolean }>(`/api/boards/${boardId}/star`, { method: 'PATCH' });
}

export function updateBoardApi(boardId: string, input: { title: string }) {
  return apiRequest<Board>(`/api/boards/${boardId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function updateBoardLabelsApi(boardId: string, labels: Label[]) {
  return apiRequest<{ boardId: string; labels: Label[] }>(`/api/boards/${boardId}/labels`, { method: 'PUT', body: JSON.stringify({ labels }) });
}

export function deleteBoardApi(boardId: string) {
  return apiRequest<{ success: boolean }>(`/api/boards/${boardId}`, { method: 'DELETE' });
}

// ── List API ─────────────────────────────────────────────────────────
export function createListApi(input: { boardId: string; title: string }) {
  return apiRequest<List>('/api/lists', { method: 'POST', body: JSON.stringify(input) });
}

export function updateListApi(listId: string, input: { title: string }) {
  return apiRequest<List>(`/api/lists/${listId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function archiveListApi(listId: string) {
  return apiRequest<{ success: boolean }>(`/api/lists/${listId}/archive`, { method: 'POST' });
}

export function restoreListApi(listId: string) {
  return apiRequest<{ success: boolean }>(`/api/lists/${listId}/restore`, { method: 'POST' });
}

export function deleteListApi(listId: string) {
  return apiRequest<{ success: boolean; deletedCardCount: number }>(`/api/lists/${listId}`, { method: 'DELETE' });
}

export function moveListApi(listId: string, toPosition: number) {
  return apiRequest<{ success: boolean }>(`/api/lists/${listId}/move`, { method: 'POST', body: JSON.stringify({ toPosition }) });
}

export function sortListApi(listId: string, direction: CardSortDirection) {
  return apiRequest<{ listId: string; direction: CardSortDirection; cards: Card[] }>(`/api/lists/${listId}/sort`, {
    method: 'POST',
    body: JSON.stringify({ direction }),
  });
}

// ── Card API ─────────────────────────────────────────────────────────
export function createCardApi(input: { boardId: string; listId: string; title: string }) {
  return apiRequest<Card>('/api/cards', { method: 'POST', body: JSON.stringify(input) });
}

export function updateCardApi(cardId: string, updates: Record<string, unknown>) {
  return apiRequest<Card>(`/api/cards/${cardId}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

export function moveCardApi(cardId: string, toListId: string, toPosition: number) {
  return apiRequest<Card>(`/api/cards/${cardId}/move`, { method: 'POST', body: JSON.stringify({ toListId, toPosition }) });
}

export function duplicateCardApi(cardId: string) {
  return apiRequest<Card>(`/api/cards/${cardId}/duplicate`, { method: 'POST', body: JSON.stringify({}) });
}

export function deleteCardApi(cardId: string) {
  return apiRequest<void>(`/api/cards/${cardId}`, { method: 'DELETE' });
}

// ── Automation Rule API ──────────────────────────────────────────────
export function createAutomationRuleApi(input: Omit<AutomationRule, 'id' | 'lastRunAt'>) {
  return apiRequest<AutomationRule>('/api/automation-rules', { method: 'POST', body: JSON.stringify(input) });
}

export function updateAutomationRuleApi(ruleId: string, updates: Partial<AutomationRule>) {
  return apiRequest<AutomationRule>(`/api/automation-rules/${ruleId}`, { method: 'PATCH', body: JSON.stringify(updates) });
}

export function deleteAutomationRuleApi(ruleId: string) {
  return apiRequest<void>(`/api/automation-rules/${ruleId}`, { method: 'DELETE' });
}

// ── Notification API ─────────────────────────────────────────────────
export function markNotificationReadApi(notificationId: string) {
  return apiRequest<{ success: boolean }>(`/api/notifications/${notificationId}/read`, { method: 'POST' });
}

export function markAllNotificationsReadApi() {
  return apiRequest<{ success: boolean }>('/api/notifications/read-all', { method: 'POST' });
}
