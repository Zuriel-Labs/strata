import { describe, expect, it } from 'vitest';
import type { Card } from '../types';
import { completeInsertionPosition } from './card-order';
import { plainTextToRichTextDocument } from './rich-text';

function card(id: string, listId: string, position: number): Card {
  return {
    id,
    title: id,
    description: '',
    descriptionDocument: plainTextToRichTextDocument(''),
    listId,
    boardId: 'board',
    position,
    memberIds: [],
    labelIds: [],
    checklists: [],
    dueDate: null,
    dueDateComplete: false,
    comments: [],
    activity: [],
    attachments: [],
    watching: false,
    archived: false,
    createdAt: '2026-08-24T00:00:00.000Z',
  };
}

describe('completeInsertionPosition', () => {
  const cards = [
    card('a', 'one', 0),
    card('hidden-b', 'one', 1),
    card('c', 'one', 2),
    card('d', 'two', 0),
    card('hidden-e', 'two', 1),
    card('f', 'two', 2),
  ];

  it('keeps hidden cards in their slots for a same-list visible reorder', () => {
    expect(completeInsertionPosition({
      cards,
      cardId: 'c',
      fromListId: 'one',
      toListId: 'one',
      originalVisibleIds: ['a', 'c'],
      nextVisibleIds: ['c', 'a'],
    })).toBe(0);
  });

  it('maps a cross-list visible insertion before the next visible card', () => {
    expect(completeInsertionPosition({
      cards,
      cardId: 'c',
      fromListId: 'one',
      toListId: 'two',
      originalVisibleIds: ['d', 'f'],
      nextVisibleIds: ['d', 'c', 'f'],
    })).toBe(2);
  });

  it('maps beginning/end/hidden-only destinations deterministically', () => {
    expect(completeInsertionPosition({ cards, cardId: 'c', fromListId: 'one', toListId: 'two', originalVisibleIds: ['d', 'f'], nextVisibleIds: ['c', 'd', 'f'] })).toBe(0);
    expect(completeInsertionPosition({ cards, cardId: 'c', fromListId: 'one', toListId: 'two', originalVisibleIds: ['d', 'f'], nextVisibleIds: ['d', 'f', 'c'] })).toBe(3);
    expect(completeInsertionPosition({ cards, cardId: 'c', fromListId: 'one', toListId: 'two', originalVisibleIds: [], nextVisibleIds: ['c'] })).toBe(3);
  });

  it('rejects inconsistent visible membership rather than risking card loss', () => {
    expect(() => completeInsertionPosition({ cards, cardId: 'c', fromListId: 'one', toListId: 'one', originalVisibleIds: ['a', 'c'], nextVisibleIds: ['a'] })).toThrow(/visible card order/i);
  });
});
