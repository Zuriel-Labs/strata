import type { AppState } from '../types';

export function getArchivedBoardItems(state: AppState, boardId: string) {
  const boardLists = state.lists.filter(list => list.boardId === boardId);
  const archivedLists = boardLists
    .filter(list => list.archived)
    .sort((left, right) => left.position - right.position);
  const archivedListIds = new Set(archivedLists.map(list => list.id));
  const archivedCards = state.cards
    .filter(card => card.boardId === boardId && card.archived && !archivedListIds.has(card.listId))
    .sort((left, right) => left.position - right.position);
  return { archivedLists, archivedCards };
}
