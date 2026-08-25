import { initialState, reducer } from './store';
import { uid } from './data';

describe('store reducer', () => {
  it('selects the first board when switching workspaces', () => {
    const state = reducer(initialState, { type: 'SET_CURRENT_WORKSPACE', payload: 'w2' });

    expect(state.currentWorkspaceId).toBe('w2');
    expect(state.currentBoardId).toBe('b3');
    expect(state.filterLabelIds).toEqual([]);
  });

  it('reorders optimistically and applies the authoritative automated card once', () => {
    const moved = reducer(initialState, { type: 'MOVE_CARD', payload: { cardId: 'c3', toListId: 'l5', toPosition: 1 } });
    const card = moved.cards.find(candidate => candidate.id === 'c3');
    const doneCards = moved.cards.filter(candidate => candidate.listId === 'l5' && !candidate.archived).sort((a, b) => a.position - b.position);

    expect(card?.listId).toBe('l5');
    expect(card?.dueDateComplete).toBe(true);
    expect(doneCards.map(candidate => candidate.id)).toEqual(['c8', 'c3']);

    const confirmed = reducer(moved, { type: 'APPLY_CARD_FROM_API', payload: { ...card!, dueDateComplete: true } });
    expect(confirmed.cards.find(candidate => candidate.id === 'c3')?.dueDateComplete).toBe(true);
  });

  it('inserts an authoritative duplicate after its source and opens it', () => {
    const source = initialState.cards.find(card => card.id === 'c5')!;
    const duplicate = { ...source, id: 'c-copy', title: `${source.title} (copy)`, position: source.position + 1, createdAt: '2026-08-25T00:00:00.000Z' };

    const state = reducer(initialState, { type: 'ADD_DUPLICATED_CARD_FROM_API', payload: { sourceCardId: source.id, card: duplicate } });

    expect(state.cards.filter(card => card.listId === source.listId && !card.archived).sort((a, b) => a.position - b.position).map(card => [card.id, card.position])).toEqual([
      ['c5', 0],
      ['c-copy', 1],
      ['c6', 2],
    ]);
    expect(state.activeCardId).toBe('c-copy');
  });

  it('does not shift source-list positions when creation automation moves the duplicate elsewhere', () => {
    const source = initialState.cards.find(card => card.id === 'c5')!;
    const duplicate = { ...source, id: 'c-copy', title: `${source.title} (copy)`, listId: 'l5', position: 1, createdAt: '2026-08-25T00:00:00.000Z' };

    const state = reducer(initialState, { type: 'ADD_DUPLICATED_CARD_FROM_API', payload: { sourceCardId: source.id, card: duplicate } });

    expect(state.cards.find(card => card.id === 'c6')?.position).toBe(1);
    expect(state.cards.find(card => card.id === 'c-copy')).toMatchObject({ listId: 'l5', position: 1 });
  });

  it('applies an authoritative sorted active-card order without changing archived cards', () => {
    const source = initialState.cards.filter(card => card.listId === 'l1' && !card.archived);
    const archived = { ...source[0], id: 'archived-in-list', archived: true, position: 77 };
    const before = { ...initialState, cards: [...initialState.cards, archived] };
    const ordered = [
      { ...source[1], position: 0 },
      { ...source[0], position: 1 },
    ];

    const state = reducer(before, { type: 'APPLY_SORTED_LIST_CARDS', payload: { listId: 'l1', cards: ordered } });

    expect(state.cards.filter(card => card.listId === 'l1' && !card.archived).sort((a, b) => a.position - b.position).map(card => card.id)).toEqual(['c6', 'c5']);
    expect(state.cards.find(card => card.id === archived.id)).toEqual(archived);
  });

  it('notifies mentioned teammates and makes comments watched', () => {
    const state = reducer(initialState, { type: 'ADD_COMMENT', payload: { cardId: 'c1', text: 'Please take a look @Alex Chen' } });
    const card = state.cards.find(candidate => candidate.id === 'c1');
    const mention = state.notifications.find(notification => notification.userId === 'u2' && notification.message.includes('mentioned'));

    expect(card?.watching).toBe(true);
    expect(card?.comments.at(-1)?.text).toContain('@Alex Chen');
    expect(mention).toBeTruthy();
  });

  it('adds notifications and watching when the active user is assigned', () => {
    const state = reducer(initialState, { type: 'UPDATE_CARD', payload: { id: 'c5', memberIds: ['u1'] } });
    const card = state.cards.find(candidate => candidate.id === 'c5');

    expect(card?.memberIds).toContain('u1');
    expect(card?.watching).toBe(true);
  });

  it('adds notifications without changing watch when another user is assigned', () => {
    const state = reducer(initialState, { type: 'UPDATE_CARD', payload: { id: 'c5', memberIds: ['u3'] } });
    const card = state.cards.find(candidate => candidate.id === 'c5');
    const assignment = state.notifications.find(notification => notification.userId === 'u3' && notification.message.includes('assigned'));

    expect(card?.memberIds).toContain('u3');
    expect(card?.watching).toBe(false);
    expect(assignment).toBeTruthy();
  });

  it('disables watching when the active user is removed from members', () => {
    const state = reducer(initialState, { type: 'UPDATE_CARD', payload: { id: 'c1', memberIds: ['u2'] } });
    const card = state.cards.find(candidate => candidate.id === 'c1');

    expect(card?.memberIds).toEqual(['u2']);
    expect(card?.watching).toBe(false);
  });

  it('adds and removes attachments', () => {
    const attachment = {
      id: uid(),
      name: 'https://figma.com/file/roadmap',
      kind: 'link' as const,
      url: 'https://figma.com/file/roadmap',
      createdAt: new Date().toISOString(),
    };

    const withAttachment = reducer(initialState, { type: 'ADD_ATTACHMENT', payload: { cardId: 'c3', attachment } });
    const withoutAttachment = reducer(withAttachment, { type: 'REMOVE_ATTACHMENT', payload: { cardId: 'c3', attachmentId: attachment.id } });

    expect(withAttachment.cards.find(candidate => candidate.id === 'c3')?.attachments).toContainEqual(attachment);
    expect(withoutAttachment.cards.find(candidate => candidate.id === 'c3')?.attachments).not.toContainEqual(attachment);
  });

  it('hydrates server state while preserving current UI selections', () => {
    const localState = {
      ...initialState,
      currentWorkspaceId: 'w1',
      currentBoardId: 'b1',
      activeCardId: 'c1',
      searchQuery: 'oauth',
      searchOpen: true,
      filterLabelIds: ['lb2'],
      viewMode: 'table' as const,
      automationPanelOpen: true,
    };
    const serverState = {
      ...initialState,
      cards: initialState.cards.map(card => card.id === 'c1' ? { ...card, labelIds: [...card.labelIds, 'lb1'] } : card),
      notifications: [],
    };

    const hydrated = reducer(localState, { type: 'HYDRATE_FROM_SESSION', payload: serverState });

    expect(hydrated.cards.find(candidate => candidate.id === 'c1')?.labelIds).toContain('lb1');
    expect(hydrated.searchQuery).toBe('oauth');
    expect(hydrated.searchOpen).toBe(true);
    expect(hydrated.viewMode).toBe('table');
    expect(hydrated.automationPanelOpen).toBe(true);
    expect(hydrated.activeCardId).toBe('c1');
  });
});
