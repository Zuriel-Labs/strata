import { initialState, reducer } from './store';
import { uid } from './data';

describe('store reducer', () => {
  it('selects the first board when switching workspaces', () => {
    const state = reducer(initialState, { type: 'SET_CURRENT_WORKSPACE', payload: 'w2' });

    expect(state.currentWorkspaceId).toBe('w2');
    expect(state.currentBoardId).toBe('b3');
    expect(state.filterLabelIds).toEqual([]);
  });

  it('reorders cards and runs done-list automation', () => {
    const moved = reducer(initialState, { type: 'MOVE_CARD', payload: { cardId: 'c3', toListId: 'l5', toPosition: 1 } });
    const card = moved.cards.find(candidate => candidate.id === 'c3');
    const doneCards = moved.cards.filter(candidate => candidate.listId === 'l5' && !candidate.archived).sort((a, b) => a.position - b.position);

    expect(card?.listId).toBe('l5');
    expect(card?.dueDateComplete).toBe(true);
    expect(doneCards.map(candidate => candidate.id)).toEqual(['c8', 'c3']);
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
