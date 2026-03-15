import { initialState, reducer } from './store';
import type { AppState, AutomationRule } from './types';

function buildState(overrides: Partial<AppState> = {}): AppState {
  return {
    ...initialState,
    workspaces: overrides.workspaces ?? initialState.workspaces.map(workspace => ({ ...workspace, memberIds: [...workspace.memberIds] })),
    boards: overrides.boards ?? initialState.boards.map(board => ({ ...board, labels: board.labels.map(label => ({ ...label })) })),
    lists: overrides.lists ?? initialState.lists.map(list => ({ ...list })),
    cards: overrides.cards ?? initialState.cards.map(card => ({
      ...card,
      memberIds: [...card.memberIds],
      labelIds: [...card.labelIds],
      checklists: card.checklists.map(checklist => ({
        ...checklist,
        items: checklist.items.map(item => ({ ...item })),
      })),
      comments: [...card.comments],
      activity: [...card.activity],
      attachments: [...card.attachments],
    })),
    users: overrides.users ?? initialState.users.map(user => ({ ...user })),
    automationRules: overrides.automationRules ?? initialState.automationRules.map(rule => ({
      ...rule,
      triggerConfig: { ...rule.triggerConfig },
      conditions: { ...rule.conditions },
      actionConfig: { ...rule.actionConfig },
    })),
    notifications: overrides.notifications ?? initialState.notifications.map(notification => ({ ...notification })),
    currentUserId: overrides.currentUserId ?? initialState.currentUserId,
    currentWorkspaceId: overrides.currentWorkspaceId ?? initialState.currentWorkspaceId,
    currentBoardId: overrides.currentBoardId ?? initialState.currentBoardId,
    activeCardId: overrides.activeCardId ?? initialState.activeCardId,
    searchQuery: overrides.searchQuery ?? initialState.searchQuery,
    searchOpen: overrides.searchOpen ?? initialState.searchOpen,
    searchTimestamp: overrides.searchTimestamp ?? initialState.searchTimestamp,
    filterLabelIds: overrides.filterLabelIds ?? [...initialState.filterLabelIds],
    filterMemberIds: overrides.filterMemberIds ?? [...initialState.filterMemberIds],
    filterDue: overrides.filterDue ?? initialState.filterDue,
    viewMode: overrides.viewMode ?? initialState.viewMode,
    sidebarOpen: overrides.sidebarOpen ?? initialState.sidebarOpen,
    automationPanelOpen: overrides.automationPanelOpen ?? initialState.automationPanelOpen,
    settingsOpen: overrides.settingsOpen ?? initialState.settingsOpen,
  };
}

function buildRule(overrides: Partial<AutomationRule>): AutomationRule {
  return {
    id: 'rule-test',
    boardId: 'b1',
    name: 'Test automation',
    trigger: 'card_moved',
    triggerConfig: {},
    conditions: { listId: null, labelId: null },
    action: 'assign_member',
    actionConfig: {},
    enabled: true,
    lastRunAt: null,
    ...overrides,
  };
}

describe('automation reducer flows', () => {
  it('assigns a member and creates notifications when a card is moved to a matching list', () => {
    const state = buildState({
      automationRules: [buildRule({ triggerConfig: { toListId: 'l4' }, actionConfig: { memberId: 'u2' } })],
    });

    const nextState = reducer(state, { type: 'MOVE_CARD', payload: { cardId: 'c5', toListId: 'l4', toPosition: 1 } });
    const updatedCard = nextState.cards.find(card => card.id === 'c5');

    expect(updatedCard?.listId).toBe('l4');
    expect(updatedCard?.memberIds).toContain('u2');
    expect(updatedCard?.watching).toBe(true);
    expect(nextState.notifications.some(notification => notification.userId === 'u2' && notification.cardId === 'c5')).toBe(true);
    expect(nextState.notifications.some(notification => notification.userId === 'u1' && notification.message.includes('Automation: Alex Chen assigned'))).toBe(true);
  });

  it('skips disabled or non-matching rules', () => {
    const state = buildState({
      automationRules: [
        buildRule({ id: 'rule-disabled', enabled: false, triggerConfig: { toListId: 'l4' }, actionConfig: { memberId: 'u2' } }),
        buildRule({ id: 'rule-mismatch', triggerConfig: { toListId: 'l5' }, actionConfig: { memberId: 'u3' } }),
      ],
    });

    const nextState = reducer(state, { type: 'MOVE_CARD', payload: { cardId: 'c5', toListId: 'l4', toPosition: 0 } });
    const updatedCard = nextState.cards.find(card => card.id === 'c5');

    expect(updatedCard?.memberIds).not.toContain('u2');
    expect(updatedCard?.memberIds).not.toContain('u3');
    expect(nextState.notifications).toHaveLength(state.notifications.length);
  });

  it('adds a label when a new card matches a card_created rule', () => {
    const state = buildState({
      automationRules: [buildRule({
        id: 'rule-label',
        trigger: 'card_created',
        action: 'add_label',
        actionConfig: { labelId: 'lb1' },
      })],
    });

    const nextState = reducer(state, { type: 'ADD_CARD', payload: { boardId: 'b1', listId: 'l1', title: 'Automated card' } });
    const createdCard = nextState.cards.find(card => card.title === 'Automated card');

    expect(createdCard).toBeDefined();
    expect(createdCard?.labelIds).toContain('lb1');
  });

  it('moves a new card to the configured destination list', () => {
    const state = buildState({
      automationRules: [buildRule({
        id: 'rule-move',
        trigger: 'card_created',
        action: 'move_to_list',
        actionConfig: { listId: 'l3' },
      })],
    });

    const nextState = reducer(state, { type: 'ADD_CARD', payload: { boardId: 'b1', listId: 'l1', title: 'Routed card' } });
    const createdCard = nextState.cards.find(card => card.title === 'Routed card');

    expect(createdCard?.listId).toBe('l3');
  });

  it('marks the due date complete when a checklist is fully completed', () => {
    const state = buildState({
      cards: initialState.cards.map(card => card.id === 'c5'
        ? {
            ...card,
            dueDate: new Date('2026-03-14T12:00:00.000Z').toISOString(),
            dueDateComplete: false,
            checklists: [{
              id: 'ck-test',
              title: 'Launch checklist',
              items: [{ id: 'item-test', text: 'Ship it', completed: false }],
            }],
          }
        : {
            ...card,
            memberIds: [...card.memberIds],
            labelIds: [...card.labelIds],
            checklists: card.checklists.map(checklist => ({
              ...checklist,
              items: checklist.items.map(item => ({ ...item })),
            })),
            comments: [...card.comments],
            activity: [...card.activity],
            attachments: [...card.attachments],
          }),
      automationRules: [buildRule({
        id: 'rule-complete',
        trigger: 'checklist_complete',
        action: 'mark_due_complete',
      })],
    });

    const nextState = reducer(state, { type: 'TOGGLE_CHECKLIST_ITEM', payload: { cardId: 'c5', checklistId: 'ck-test', itemId: 'item-test' } });
    const updatedCard = nextState.cards.find(card => card.id === 'c5');

    expect(updatedCard?.dueDateComplete).toBe(true);
  });

  it('does not duplicate labels or assignments when automations rerun on already-updated cards', () => {
    const state = buildState({
      cards: initialState.cards.map(card => card.id === 'c5'
        ? {
            ...card,
            memberIds: ['u2'],
            labelIds: ['lb1'],
            checklists: card.checklists.map(checklist => ({ ...checklist, items: checklist.items.map(item => ({ ...item })) })),
            comments: [...card.comments],
            activity: [...card.activity],
            attachments: [...card.attachments],
          }
        : {
            ...card,
            memberIds: [...card.memberIds],
            labelIds: [...card.labelIds],
            checklists: card.checklists.map(checklist => ({
              ...checklist,
              items: checklist.items.map(item => ({ ...item })),
            })),
            comments: [...card.comments],
            activity: [...card.activity],
            attachments: [...card.attachments],
          }),
      automationRules: [
        buildRule({ id: 'rule-assign', triggerConfig: { toListId: 'l4' }, actionConfig: { memberId: 'u2' } }),
        buildRule({ id: 'rule-label', triggerConfig: { toListId: 'l4' }, action: 'add_label', actionConfig: { labelId: 'lb1' } }),
      ],
    });

    const nextState = reducer(state, { type: 'MOVE_CARD', payload: { cardId: 'c5', toListId: 'l4', toPosition: 0 } });
    const updatedCard = nextState.cards.find(card => card.id === 'c5');

    expect(updatedCard?.memberIds.filter(memberId => memberId === 'u2')).toHaveLength(1);
    expect(updatedCard?.labelIds.filter(labelId => labelId === 'lb1')).toHaveLength(1);
  });
});
