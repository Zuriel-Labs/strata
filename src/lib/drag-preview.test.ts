import { describe, expect, it } from 'vitest';
import { locateCardInsertion, locateListInsertion, retainLastValidInsertion } from './drag-preview';

describe('drag insertion preview', () => {
  it('locates card insertion from the projected groups', () => {
    const groups = { one: ['a'], two: ['b', 'moving', 'c'] };
    expect(locateCardInsertion(groups, 'moving')).toEqual({ groupId: 'two', index: 1 });
  });

  it('locates horizontal lane insertion', () => {
    expect(locateListInsertion(['list:a', 'list:moving', 'list:b'], 'list:moving')).toEqual({ groupId: 'board', index: 1 });
  });

  it('retains the last valid insertion across transient invalid collisions', () => {
    const last = { groupId: 'two', index: 1 };
    expect(retainLastValidInsertion(last, null)).toEqual(last);
    expect(retainLastValidInsertion(last, { groupId: 'two', index: 2 })).toEqual({ groupId: 'two', index: 2 });
  });

  it('retains exactly one last-valid destination through 100 alternating boundary misses', () => {
    let insertion = { groupId: 'one', index: 0 };
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const next = iteration % 4 === 0 ? { groupId: iteration % 8 === 0 ? 'one' : 'two', index: iteration % 3 } : null;
      insertion = retainLastValidInsertion(insertion, next)!;
      expect(insertion).not.toBeNull();
      expect(Number.isInteger(insertion.index)).toBe(true);
    }
  });
});
