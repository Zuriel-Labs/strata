import type { Card } from '../types';

export type CardSortDirection = 'asc' | 'desc';

const CARD_TITLE_COLLATOR = new Intl.Collator('en-US', {
  numeric: true,
  sensitivity: 'base',
  usage: 'sort',
});

export function sortCardsByTitle(cards: Card[], direction: CardSortDirection): Card[] {
  return [...cards].sort((left, right) => {
    const titleOrder = CARD_TITLE_COLLATOR.compare(left.title.trim(), right.title.trim());
    if (titleOrder !== 0) return direction === 'asc' ? titleOrder : -titleOrder;

    const positionOrder = left.position - right.position;
    if (positionOrder !== 0) return positionOrder;
    return left.id.localeCompare(right.id);
  });
}
