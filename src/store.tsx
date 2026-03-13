import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import type { AppState, Action, Card, AutomationRule, User } from './types';
import { USERS, WORKSPACES, BOARDS, LISTS, CARDS, AUTOMATION_RULES, NOTIFICATIONS, uid } from './data';

export const STORAGE_KEY = 'strata-app-state';

export const initialState: AppState = {
  workspaces: WORKSPACES,
  boards: BOARDS,
  lists: LISTS,
  cards: CARDS,
  users: USERS,
  automationRules: AUTOMATION_RULES,
  notifications: NOTIFICATIONS,
  currentUserId: 'u1',
  currentWorkspaceId: 'w1',
  currentBoardId: 'b1',
  activeCardId: null,
  searchQuery: '',
  searchOpen: false,
  searchTimestamp: 0,
  filterLabelIds: [],
  filterMemberIds: [],
  filterDue: 'all',
  viewMode: 'board',
  sidebarOpen: true,
  automationPanelOpen: false,
  settingsOpen: false,
};

function appendActivity(card: Card, userId: string, action: string): Card {
  return {
    ...card,
    activity: [...card.activity, { id: uid(), userId, action, createdAt: new Date().toISOString() }],
  };
}

function createNotificationsForUsers(state: AppState, userIds: string[], card: Card, message: string) {
  const uniqueUserIds = [...new Set(userIds)].filter(userId => userId !== state.currentUserId);
  return uniqueUserIds.map(userId => ({
    id: uid(),
    userId,
    cardId: card.id,
    boardId: card.boardId,
    message,
    read: false,
    createdAt: new Date().toISOString(),
  }));
}

function getMentionedUserIds(text: string, users: User[]) {
  const matches = text.match(/@[^\s,.;:!?]+(?:\s+[^\s,.;:!?]+)?/g) ?? [];
  const mentions = matches.map(match => match.slice(1).trim().toLowerCase());

  return users
    .filter(user => mentions.some(mention => user.name.toLowerCase().includes(mention)))
    .map(user => user.id);
}

function getBoardDefault(boardId: string | null, boards: AppState['boards']): { currentBoardId: string | null; currentWorkspaceId: string | null } {
  if (!boardId) return { currentBoardId: null, currentWorkspaceId: null };
  const board = boards.find(candidate => candidate.id === boardId) ?? null;
  return {
    currentBoardId: board?.id ?? null,
    currentWorkspaceId: board?.workspaceId ?? null,
  };
}

function reindexCards(cards: Card[]): Card[] {
  return cards.map((card, index) => ({ ...card, position: index }));
}

function moveCard(cards: Card[], cardId: string, toListId: string, toPosition: number): { cards: Card[]; movedCard: Card | null; fromListId: string | null } {
  const movingCard = cards.find(card => card.id === cardId);
  if (!movingCard) return { cards, movedCard: null, fromListId: null };

  const fromListId = movingCard.listId;
  const sourceCards = cards.filter(card => card.listId === fromListId && !card.archived && card.id !== cardId).sort((a, b) => a.position - b.position);
  const destinationBaseCards = (fromListId === toListId ? sourceCards : cards.filter(card => card.listId === toListId && !card.archived)).sort((a, b) => a.position - b.position);
  const insertAt = Math.max(0, Math.min(toPosition, destinationBaseCards.length));

  const destinationCards = [...destinationBaseCards];
  const movedCard = { ...movingCard, listId: toListId };
  destinationCards.splice(insertAt, 0, movedCard);

  const updatedById = new Map<string, Card>();
  for (const card of reindexCards(sourceCards)) updatedById.set(card.id, card);
  for (const card of reindexCards(destinationCards)) updatedById.set(card.id, card);

  return {
    cards: cards.map(card => updatedById.get(card.id) ?? card),
    movedCard: updatedById.get(cardId) ?? null,
    fromListId,
  };
}

export function loadInitialState(): AppState {
  if (typeof window === 'undefined') return initialState;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return { ...initialState, ...parsed };
  } catch {
    return initialState;
  }
}

function runAutomations(state: AppState, card: Card, trigger: AutomationRule['trigger'], extra?: Record<string, string>): AppState {
  const rules = state.automationRules.filter(rule => rule.boardId === card.boardId && rule.trigger === trigger && rule.enabled);
  const updatedCards = [...state.cards];
  const notifications = [...state.notifications];

  for (const rule of rules) {
    if (trigger === 'card_moved' && rule.triggerConfig.toListId && extra?.toListId !== rule.triggerConfig.toListId) continue;
    const idx = updatedCards.findIndex(candidate => candidate.id === card.id);
    if (idx === -1) continue;

    const nextCard = { ...updatedCards[idx] };

    if (rule.action === 'assign_member' && rule.actionConfig.memberId && !nextCard.memberIds.includes(rule.actionConfig.memberId)) {
      nextCard.memberIds = [...nextCard.memberIds, rule.actionConfig.memberId];
      nextCard.watching = true;
      nextCard.activity = [...nextCard.activity, { id: uid(), userId: state.currentUserId, action: 'automatically assigned a member', createdAt: new Date().toISOString() }];
      const user = state.users.find(candidate => candidate.id === rule.actionConfig.memberId);
      notifications.push(...createNotificationsForUsers(state, [rule.actionConfig.memberId], nextCard, `Automation assigned you to "${nextCard.title}"`));
      notifications.push({ id: uid(), userId: state.currentUserId, cardId: nextCard.id, boardId: nextCard.boardId, message: `Automation: ${user?.name || 'Someone'} assigned to "${nextCard.title}"`, read: false, createdAt: new Date().toISOString() });
    }

    if (rule.action === 'add_label' && rule.actionConfig.labelId && !nextCard.labelIds.includes(rule.actionConfig.labelId)) {
      nextCard.labelIds = [...nextCard.labelIds, rule.actionConfig.labelId];
      nextCard.activity = [...nextCard.activity, { id: uid(), userId: state.currentUserId, action: 'automatically added a label', createdAt: new Date().toISOString() }];
    }

    if (rule.action === 'move_to_list' && rule.actionConfig.listId) {
      nextCard.listId = rule.actionConfig.listId;
      nextCard.position = updatedCards.filter(candidate => candidate.listId === rule.actionConfig.listId && !candidate.archived).length;
      nextCard.activity = [...nextCard.activity, { id: uid(), userId: state.currentUserId, action: 'automatically moved this card', createdAt: new Date().toISOString() }];
    }

    if (rule.action === 'mark_due_complete') {
      nextCard.dueDateComplete = true;
      nextCard.activity = [...nextCard.activity, { id: uid(), userId: state.currentUserId, action: 'automatically marked the due date complete', createdAt: new Date().toISOString() }];
    }

    updatedCards[idx] = nextCard;
  }

  return { ...state, cards: updatedCards, notifications };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_CURRENT_WORKSPACE':
      return {
        ...state,
        currentWorkspaceId: action.payload,
        currentBoardId: action.payload ? (state.boards.find(board => board.workspaceId === action.payload)?.id ?? null) : null,
        filterLabelIds: [],
        filterMemberIds: [],
        filterDue: 'all',
      };

    case 'SET_CURRENT_BOARD': {
      const next = getBoardDefault(action.payload, state.boards);
      return { ...state, ...next, filterLabelIds: [], filterMemberIds: [], filterDue: 'all' };
    }

    case 'SET_ACTIVE_CARD':
      return { ...state, activeCardId: action.payload };

    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };

    case 'SET_SEARCH_OPEN':
      return {
        ...state,
        searchOpen: action.payload,
        searchQuery: action.payload ? state.searchQuery : '',
        searchTimestamp: action.payload ? Date.now() : state.searchTimestamp,
      };

    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };

    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen };

    case 'SET_AUTOMATION_PANEL':
      return { ...state, automationPanelOpen: action.payload };

    case 'SET_SETTINGS_OPEN':
      return { ...state, settingsOpen: action.payload };

    case 'SET_FILTER_LABELS':
      return { ...state, filterLabelIds: action.payload };

    case 'SET_FILTER_MEMBERS':
      return { ...state, filterMemberIds: action.payload };

    case 'SET_FILTER_DUE':
      return { ...state, filterDue: action.payload };

    case 'ADD_LIST': {
      const maxPos = Math.max(-1, ...state.lists.filter(list => list.boardId === action.payload.boardId).map(list => list.position));
      return { ...state, lists: [...state.lists, { id: uid(), title: action.payload.title, boardId: action.payload.boardId, position: maxPos + 1, archived: false }] };
    }

    case 'UPDATE_LIST':
      return { ...state, lists: state.lists.map(list => list.id === action.payload.id ? { ...list, title: action.payload.title } : list) };

    case 'ARCHIVE_LIST':
      return { ...state, lists: state.lists.map(list => list.id === action.payload ? { ...list, archived: true } : list), cards: state.cards.map(card => card.listId === action.payload ? { ...card, archived: true } : card) };

    case 'RESTORE_LIST':
      return {
        ...state,
        lists: state.lists.map(list => list.id === action.payload ? { ...list, archived: false } : list),
        cards: state.cards.map(card => card.listId === action.payload ? { ...card, archived: false } : card),
      };

    case 'ADD_CARD': {
      const maxPos = Math.max(-1, ...state.cards.filter(card => card.listId === action.payload.listId && !card.archived).map(card => card.position));
      const newCard: Card = {
        id: uid(),
        title: action.payload.title,
        description: '',
        listId: action.payload.listId,
        boardId: action.payload.boardId,
        position: maxPos + 1,
        memberIds: [],
        labelIds: [],
        checklists: [],
        dueDate: null,
        dueDateComplete: false,
        comments: [],
        activity: [{ id: uid(), userId: state.currentUserId, action: 'created this card', createdAt: new Date().toISOString() }],
        attachments: [],
        watching: false,
        archived: false,
        createdAt: new Date().toISOString(),
      };
      return runAutomations({ ...state, cards: [...state.cards, newCard] }, newCard, 'card_created');
    }

    case 'UPDATE_CARD': {
      const currentCard = state.cards.find(card => card.id === action.payload.id);
      const addedUserIds = currentCard && action.payload.memberIds ? action.payload.memberIds.filter(memberId => !currentCard.memberIds.includes(memberId)) : [];

      return {
        ...state,
        notifications: currentCard ? state.notifications.concat(createNotificationsForUsers(state, addedUserIds, currentCard, `You were assigned to "${currentCard.title}"`)) : state.notifications,
        cards: state.cards.map(card => {
          if (card.id !== action.payload.id) return card;
          let updated = { ...card, ...action.payload, watching: addedUserIds.length > 0 ? true : action.payload.watching ?? card.watching };
          if (addedUserIds.length > 0) updated = appendActivity(updated, state.currentUserId, 'updated card members');
          if (action.payload.dueDate !== undefined && action.payload.dueDate !== card.dueDate) updated = appendActivity(updated, state.currentUserId, action.payload.dueDate ? 'set a due date' : 'removed the due date');
          if (action.payload.description !== undefined && action.payload.description !== card.description) updated = appendActivity(updated, state.currentUserId, 'updated the description');
          if (action.payload.watching !== undefined && action.payload.watching !== card.watching) updated = appendActivity(updated, state.currentUserId, action.payload.watching ? 'started watching this card' : 'stopped watching this card');
          return updated;
        }),
      };
    }

    case 'MOVE_CARD': {
      const { cards, movedCard, fromListId } = moveCard(state.cards, action.payload.cardId, action.payload.toListId, action.payload.toPosition);
      if (!movedCard) return state;
      const destinationList = state.lists.find(list => list.id === action.payload.toListId);
      const activityCard = appendActivity(movedCard, state.currentUserId, `moved this card${fromListId !== action.payload.toListId && destinationList ? ` to ${destinationList.title}` : ''}`);
      return runAutomations({ ...state, cards: cards.map(card => card.id === activityCard.id ? activityCard : card) }, activityCard, 'card_moved', { toListId: action.payload.toListId });
    }

    case 'ARCHIVE_CARD':
      return {
        ...state,
        cards: state.cards.map(card => card.id === action.payload ? appendActivity({ ...card, archived: true }, state.currentUserId, 'archived this card') : card),
        activeCardId: state.activeCardId === action.payload ? null : state.activeCardId,
      };

    case 'RESTORE_CARD':
      return {
        ...state,
        cards: state.cards.map(card => {
          if (card.id !== action.payload) return card;
          const position = state.cards.filter(candidate => candidate.listId === card.listId && !candidate.archived && candidate.id !== card.id).length;
          return appendActivity({ ...card, archived: false, position }, state.currentUserId, 'restored this card from the archive');
        }),
      };

    case 'DELETE_CARD':
      return { ...state, cards: state.cards.filter(card => card.id !== action.payload), activeCardId: state.activeCardId === action.payload ? null : state.activeCardId };

    case 'ADD_COMMENT': {
      const comment = { id: uid(), userId: state.currentUserId, text: action.payload.text, createdAt: new Date().toISOString() };
      const currentCard = state.cards.find(card => card.id === action.payload.cardId);
      const mentionedUserIds = getMentionedUserIds(action.payload.text, state.users);

      return {
        ...state,
        notifications: currentCard ? state.notifications.concat(createNotificationsForUsers(state, mentionedUserIds, currentCard, `You were mentioned in "${currentCard.title}"`)) : state.notifications,
        cards: state.cards.map(card => card.id === action.payload.cardId ? appendActivity({ ...card, comments: [...card.comments, comment], watching: true }, state.currentUserId, 'commented on this card') : card),
      };
    }

    case 'ADD_CHECKLIST': {
      const checklist = { id: uid(), title: action.payload.title, items: [] };
      return { ...state, cards: state.cards.map(card => card.id === action.payload.cardId ? { ...card, checklists: [...card.checklists, checklist] } : card) };
    }

    case 'TOGGLE_CHECKLIST_ITEM': {
      const nextState = {
        ...state,
        cards: state.cards.map(card => {
          if (card.id !== action.payload.cardId) return card;
          const checklists = card.checklists.map(checklist => {
            if (checklist.id !== action.payload.checklistId) return checklist;
            return { ...checklist, items: checklist.items.map(item => item.id === action.payload.itemId ? { ...item, completed: !item.completed } : item) };
          });
          return appendActivity({ ...card, checklists }, state.currentUserId, 'updated a checklist item');
        }),
      };

      const updatedCard = nextState.cards.find(card => card.id === action.payload.cardId);
      if (!updatedCard) return nextState;
      const completedChecklist = updatedCard.checklists.find(checklist => checklist.items.length > 0 && checklist.items.every(item => item.completed));
      return completedChecklist ? runAutomations(nextState, updatedCard, 'checklist_complete') : nextState;
    }

    case 'ADD_CHECKLIST_ITEM': {
      const item = { id: uid(), text: action.payload.text, completed: false };
      return {
        ...state,
        cards: state.cards.map(card => {
          if (card.id !== action.payload.cardId) return card;
          return appendActivity({ ...card, checklists: card.checklists.map(checklist => checklist.id === action.payload.checklistId ? { ...checklist, items: [...checklist.items, item] } : checklist) }, state.currentUserId, 'added a checklist item');
        }),
      };
    }

    case 'DELETE_CHECKLIST_ITEM':
      return {
        ...state,
        cards: state.cards.map(card => {
          if (card.id !== action.payload.cardId) return card;
          return appendActivity({ ...card, checklists: card.checklists.map(checklist => checklist.id === action.payload.checklistId ? { ...checklist, items: checklist.items.filter(item => item.id !== action.payload.itemId) } : checklist) }, state.currentUserId, 'removed a checklist item');
        }),
      };

    case 'ADD_ATTACHMENT':
      return {
        ...state,
        cards: state.cards.map(card => card.id === action.payload.cardId ? appendActivity({ ...card, attachments: [...card.attachments, action.payload.attachment] }, state.currentUserId, `attached ${action.payload.attachment.name}`) : card),
      };

    case 'REMOVE_ATTACHMENT':
      return {
        ...state,
        cards: state.cards.map(card => {
          if (card.id !== action.payload.cardId) return card;
          const attachment = card.attachments.find(item => item.id === action.payload.attachmentId);
          return attachment ? appendActivity({ ...card, attachments: card.attachments.filter(item => item.id !== action.payload.attachmentId) }, state.currentUserId, `removed ${attachment.name}`) : card;
        }),
      };

    case 'ADD_BOARD': {
      const board = {
        id: uid(),
        title: action.payload.title,
        workspaceId: action.payload.workspaceId,
        visibility: 'workspace' as const,
        color: action.payload.color,
        starred: false,
        labels: [
          { id: uid(), name: 'Urgent', color: '#ef4444' },
          { id: uid(), name: 'Feature', color: '#a855f7' },
          { id: uid(), name: 'Bug', color: '#f97316' },
        ],
      };
      return { ...state, boards: [...state.boards, board], currentWorkspaceId: board.workspaceId, currentBoardId: board.id };
    }

    case 'TOGGLE_BOARD_STAR':
      return { ...state, boards: state.boards.map(board => board.id === action.payload ? { ...board, starred: !board.starred } : board) };

    case 'ADD_AUTOMATION_RULE':
      return { ...state, automationRules: [...state.automationRules, { ...action.payload, id: uid() }] };

    case 'UPDATE_AUTOMATION_RULE':
      return { ...state, automationRules: state.automationRules.map(rule => rule.id === action.payload.id ? { ...rule, ...action.payload } : rule) };

    case 'DELETE_AUTOMATION_RULE':
      return { ...state, automationRules: state.automationRules.filter(rule => rule.id !== action.payload) };

    case 'MARK_NOTIFICATION_READ':
      return { ...state, notifications: state.notifications.map(notification => notification.id === action.payload ? { ...notification, read: true } : notification) };

    case 'MARK_ALL_NOTIFICATIONS_READ':
      return { ...state, notifications: state.notifications.map(notification => ({ ...notification, read: true })) };

    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [...state.notifications, { ...action.payload, id: uid(), createdAt: new Date().toISOString() }] };

    case 'MOVE_LIST': {
      const list = state.lists.find(candidate => candidate.id === action.payload.listId);
      if (!list) return state;
      const boardLists = state.lists.filter(candidate => candidate.boardId === list.boardId && !candidate.archived).sort((a, b) => a.position - b.position);
      const reordered = boardLists.filter(candidate => candidate.id !== action.payload.listId);
      reordered.splice(action.payload.toPosition, 0, list);
      return {
        ...state,
        lists: state.lists.map(candidate => {
          const index = reordered.findIndex(item => item.id === candidate.id);
          return index >= 0 ? { ...candidate, position: index } : candidate;
        }),
      };
    }

    default:
      return state;
  }
}

const StateContext = createContext<AppState>(initialState);
const DispatchContext = createContext<Dispatch<Action>>(() => {});

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export const useAppState = () => useContext(StateContext);
export const useDispatch = () => useContext(DispatchContext);
