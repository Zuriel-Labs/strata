import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { AppState, Action, Card, AutomationRule } from './types';
import { USERS, WORKSPACES, BOARDS, LISTS, CARDS, AUTOMATION_RULES, NOTIFICATIONS, uid } from './data';

const initialState: AppState = {
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
  filterLabelIds: [],
  filterMemberIds: [],
  filterDue: 'all',
  viewMode: 'board',
  sidebarOpen: true,
  automationPanelOpen: false,
  settingsOpen: false,
};

function runAutomations(state: AppState, card: Card, trigger: AutomationRule['trigger'], extra?: Record<string, string>): AppState {
  const rules = state.automationRules.filter(r => r.boardId === card.boardId && r.trigger === trigger && r.enabled);
  let updatedCards = [...state.cards];
  let notifications = [...state.notifications];

  for (const rule of rules) {
    if (trigger === 'card_moved' && rule.triggerConfig.toListId && extra?.toListId !== rule.triggerConfig.toListId) continue;
    const idx = updatedCards.findIndex(c => c.id === card.id);
    if (idx === -1) continue;
    const c = { ...updatedCards[idx] };

    if (rule.action === 'assign_member' && rule.actionConfig.memberId) {
      if (!c.memberIds.includes(rule.actionConfig.memberId)) {
        c.memberIds = [...c.memberIds, rule.actionConfig.memberId];
        const user = state.users.find(u => u.id === rule.actionConfig.memberId);
        notifications.push({ id: uid(), userId: state.currentUserId, cardId: c.id, boardId: c.boardId, message: `Automation: ${user?.name || 'Someone'} assigned to "${c.title}"`, read: false, createdAt: new Date().toISOString() });
      }
    }
    if (rule.action === 'add_label' && rule.actionConfig.labelId) {
      if (!c.labelIds.includes(rule.actionConfig.labelId)) c.labelIds = [...c.labelIds, rule.actionConfig.labelId];
    }
    if (rule.action === 'move_to_list' && rule.actionConfig.listId) {
      c.listId = rule.actionConfig.listId;
      c.position = updatedCards.filter(x => x.listId === rule.actionConfig.listId && !x.archived).length;
    }
    if (rule.action === 'mark_due_complete') {
      c.dueDateComplete = true;
    }
    updatedCards[idx] = c;
  }
  return { ...state, cards: updatedCards, notifications };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_CURRENT_WORKSPACE':
      return { ...state, currentWorkspaceId: action.payload, currentBoardId: null };
    case 'SET_CURRENT_BOARD':
      return { ...state, currentBoardId: action.payload, filterLabelIds: [], filterMemberIds: [], filterDue: 'all' };
    case 'SET_ACTIVE_CARD':
      return { ...state, activeCardId: action.payload };
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };
    case 'SET_SEARCH_OPEN':
      return { ...state, searchOpen: action.payload, searchQuery: action.payload ? state.searchQuery : '' };
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
      const maxPos = Math.max(-1, ...state.lists.filter(l => l.boardId === action.payload.boardId).map(l => l.position));
      return { ...state, lists: [...state.lists, { id: uid(), title: action.payload.title, boardId: action.payload.boardId, position: maxPos + 1, archived: false }] };
    }
    case 'UPDATE_LIST':
      return { ...state, lists: state.lists.map(l => l.id === action.payload.id ? { ...l, title: action.payload.title } : l) };
    case 'ARCHIVE_LIST':
      return { ...state, lists: state.lists.map(l => l.id === action.payload ? { ...l, archived: true } : l), cards: state.cards.map(c => c.listId === action.payload ? { ...c, archived: true } : c) };
    case 'RESTORE_LIST':
      return { ...state, lists: state.lists.map(l => l.id === action.payload ? { ...l, archived: false } : l) };

    case 'ADD_CARD': {
      const maxPos = Math.max(-1, ...state.cards.filter(c => c.listId === action.payload.listId && !c.archived).map(c => c.position));
      const newCard: Card = {
        id: uid(), title: action.payload.title, description: '', listId: action.payload.listId, boardId: action.payload.boardId,
        position: maxPos + 1, memberIds: [], labelIds: [], checklists: [], dueDate: null, dueDateComplete: false,
        comments: [], activity: [{ id: uid(), userId: state.currentUserId, action: 'created this card', createdAt: new Date().toISOString() }],
        attachments: [], watching: false, archived: false, createdAt: new Date().toISOString(),
      };
      const s = { ...state, cards: [...state.cards, newCard] };
      return runAutomations(s, newCard, 'card_created');
    }

    case 'UPDATE_CARD':
      return { ...state, cards: state.cards.map(c => c.id === action.payload.id ? { ...c, ...action.payload } : c) };

    case 'MOVE_CARD': {
      const { cardId, toListId, toPosition } = action.payload;
      const card = state.cards.find(c => c.id === cardId);
      if (!card) return state;
      const updated = state.cards.map(c => {
        if (c.id === cardId) return { ...c, listId: toListId, position: toPosition };
        if (c.listId === toListId && !c.archived && c.id !== cardId && c.position >= toPosition) return { ...c, position: c.position + 1 };
        return c;
      });
      const s = { ...state, cards: updated };
      return runAutomations(s, { ...card, listId: toListId }, 'card_moved', { toListId });
    }

    case 'ARCHIVE_CARD':
      return { ...state, cards: state.cards.map(c => c.id === action.payload ? { ...c, archived: true } : c), activeCardId: state.activeCardId === action.payload ? null : state.activeCardId };
    case 'RESTORE_CARD':
      return { ...state, cards: state.cards.map(c => c.id === action.payload ? { ...c, archived: false } : c) };
    case 'DELETE_CARD':
      return { ...state, cards: state.cards.filter(c => c.id !== action.payload), activeCardId: state.activeCardId === action.payload ? null : state.activeCardId };

    case 'ADD_COMMENT': {
      const comment = { id: uid(), userId: state.currentUserId, text: action.payload.text, createdAt: new Date().toISOString() };
      return {
        ...state,
        cards: state.cards.map(c => c.id === action.payload.cardId ? { ...c, comments: [...c.comments, comment], watching: true } : c),
      };
    }

    case 'ADD_CHECKLIST': {
      const cl = { id: uid(), title: action.payload.title, items: [] };
      return { ...state, cards: state.cards.map(c => c.id === action.payload.cardId ? { ...c, checklists: [...c.checklists, cl] } : c) };
    }
    case 'TOGGLE_CHECKLIST_ITEM': {
      return {
        ...state,
        cards: state.cards.map(c => {
          if (c.id !== action.payload.cardId) return c;
          const checklists = c.checklists.map(cl => {
            if (cl.id !== action.payload.checklistId) return cl;
            return { ...cl, items: cl.items.map(i => i.id === action.payload.itemId ? { ...i, completed: !i.completed } : i) };
          });
          return { ...c, checklists };
        }),
      };
    }
    case 'ADD_CHECKLIST_ITEM': {
      const item = { id: uid(), text: action.payload.text, completed: false };
      return {
        ...state,
        cards: state.cards.map(c => {
          if (c.id !== action.payload.cardId) return c;
          return { ...c, checklists: c.checklists.map(cl => cl.id === action.payload.checklistId ? { ...cl, items: [...cl.items, item] } : cl) };
        }),
      };
    }
    case 'DELETE_CHECKLIST_ITEM': {
      return {
        ...state,
        cards: state.cards.map(c => {
          if (c.id !== action.payload.cardId) return c;
          return { ...c, checklists: c.checklists.map(cl => cl.id === action.payload.checklistId ? { ...cl, items: cl.items.filter(i => i.id !== action.payload.itemId) } : cl) };
        }),
      };
    }

    case 'ADD_BOARD': {
      const board = { id: uid(), title: action.payload.title, workspaceId: action.payload.workspaceId, visibility: 'workspace' as const, color: action.payload.color, starred: false, labels: [
        { id: uid(), name: 'Urgent', color: '#ef4444' }, { id: uid(), name: 'Feature', color: '#a855f7' }, { id: uid(), name: 'Bug', color: '#f97316' },
      ]};
      return { ...state, boards: [...state.boards, board] };
    }
    case 'TOGGLE_BOARD_STAR':
      return { ...state, boards: state.boards.map(b => b.id === action.payload ? { ...b, starred: !b.starred } : b) };

    case 'ADD_AUTOMATION_RULE':
      return { ...state, automationRules: [...state.automationRules, { ...action.payload, id: uid() }] };
    case 'UPDATE_AUTOMATION_RULE':
      return { ...state, automationRules: state.automationRules.map(r => r.id === action.payload.id ? { ...r, ...action.payload } : r) };
    case 'DELETE_AUTOMATION_RULE':
      return { ...state, automationRules: state.automationRules.filter(r => r.id !== action.payload) };

    case 'MARK_NOTIFICATION_READ':
      return { ...state, notifications: state.notifications.map(n => n.id === action.payload ? { ...n, read: true } : n) };
    case 'MARK_ALL_NOTIFICATIONS_READ':
      return { ...state, notifications: state.notifications.map(n => ({ ...n, read: true })) };
    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [...state.notifications, { ...action.payload, id: uid(), createdAt: new Date().toISOString() }] };

    case 'MOVE_LIST': {
      const { listId, toPosition } = action.payload;
      const list = state.lists.find(l => l.id === listId);
      if (!list) return state;
      const boardLists = state.lists.filter(l => l.boardId === list.boardId && !l.archived).sort((a, b) => a.position - b.position);
      const reordered = boardLists.filter(l => l.id !== listId);
      reordered.splice(toPosition, 0, list);
      const updated = state.lists.map(l => {
        const idx = reordered.findIndex(r => r.id === l.id);
        return idx >= 0 ? { ...l, position: idx } : l;
      });
      return { ...state, lists: updated };
    }

    default:
      return state;
  }
}

const StateContext = createContext<AppState>(initialState);
const DispatchContext = createContext<Dispatch<Action>>(() => {});

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
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
