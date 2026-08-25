import { describe, expect, it } from 'vitest';
import { CARDS } from '../data';
import { sortCardsByTitle } from './card-sort';

function card(id: string, title: string, position: number) {
  return { ...CARDS[0], id, title, position };
}

describe('sortCardsByTitle', () => {
  const cards = [
    card('stable-first', 'álpha', 0),
    card('item-ten', 'item 10', 1),
    card('stable-second', 'Alpha', 2),
    card('item-two', ' Item 2 ', 3),
  ];

  it('uses a fixed case- and accent-insensitive numeric collation for ascending titles', () => {
    expect(sortCardsByTitle(cards, 'asc').map(value => value.id)).toEqual([
      'stable-first', 'stable-second', 'item-two', 'item-ten',
    ]);
  });

  it('reverses title groups but preserves the prior order of equal titles', () => {
    expect(sortCardsByTitle(cards, 'desc').map(value => value.id)).toEqual([
      'item-ten', 'item-two', 'stable-first', 'stable-second',
    ]);
  });

  it('returns a new array without mutating the source order', () => {
    const sorted = sortCardsByTitle(cards, 'asc');
    expect(sorted).not.toBe(cards);
    expect(cards.map(value => value.id)).toEqual(['stable-first', 'item-ten', 'stable-second', 'item-two']);
  });
});
