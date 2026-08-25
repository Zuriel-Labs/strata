export interface OrderedCard {
  id: string;
  listId: string;
  position: number;
}

export interface CardInsertion {
  cardId: string;
  toListId: string;
  toPosition: number;
}

interface CompleteInsertionInput {
  cards: OrderedCard[];
  cardId: string;
  fromListId: string;
  toListId: string;
  originalVisibleIds: string[];
  nextVisibleIds: string[];
}

function sameMembers(left: string[], right: string[]) {
  return left.length === right.length && new Set(left).size === left.length && new Set(right).size === right.length
    && left.every(id => right.includes(id));
}

export function completeInsertionPosition({
  cards,
  cardId,
  fromListId,
  toListId,
  originalVisibleIds,
  nextVisibleIds,
}: CompleteInsertionInput) {
  const destinationIds = cards
    .filter(card => card.listId === toListId)
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map(card => card.id);

  if (fromListId === toListId) {
    if (!sameMembers(originalVisibleIds, nextVisibleIds) || !nextVisibleIds.includes(cardId)) {
      throw new Error('Inconsistent visible card order.');
    }
    const visibleSet = new Set(originalVisibleIds);
    const finalIds = [...destinationIds];
    const visibleSlots = finalIds.flatMap((id, index) => visibleSet.has(id) ? [index] : []);
    if (visibleSlots.length !== nextVisibleIds.length) throw new Error('Inconsistent visible card order.');
    visibleSlots.forEach((slot, index) => { finalIds[slot] = nextVisibleIds[index]; });
    const position = finalIds.indexOf(cardId);
    if (position < 0) throw new Error('Inconsistent visible card order.');
    return position;
  }

  if (!nextVisibleIds.includes(cardId) || !sameMembers(nextVisibleIds.filter(id => id !== cardId), originalVisibleIds)) {
    throw new Error('Inconsistent visible card order.');
  }
  const visibleIndex = nextVisibleIds.indexOf(cardId);
  const nextVisibleId = nextVisibleIds[visibleIndex + 1];
  if (nextVisibleId) {
    const position = destinationIds.indexOf(nextVisibleId);
    if (position < 0) throw new Error('Inconsistent visible card order.');
    return position;
  }
  const previousVisibleId = nextVisibleIds[visibleIndex - 1];
  if (previousVisibleId) {
    const position = destinationIds.indexOf(previousVisibleId);
    if (position < 0) throw new Error('Inconsistent visible card order.');
    return position + 1;
  }
  return destinationIds.length;
}
