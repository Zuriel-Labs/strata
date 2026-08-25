export interface DragInsertion { groupId: string; index: number }

export function locateCardInsertion(groups: Record<string, string[]>, sourceId: string): DragInsertion | null {
  for (const [groupId, ids] of Object.entries(groups)) {
    const index = ids.indexOf(sourceId);
    if (index >= 0) return { groupId, index };
  }
  return null;
}

export function locateListInsertion(ids: string[], sourceId: string): DragInsertion | null {
  const index = ids.indexOf(sourceId);
  return index >= 0 ? { groupId: 'board', index } : null;
}

export function retainLastValidInsertion(lastValid: DragInsertion | null, next: DragInsertion | null): DragInsertion | null {
  return next ?? lastValid;
}
