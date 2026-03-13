export type Visibility = 'private' | 'workspace' | 'public';
export type WorkspaceRole = 'admin' | 'member' | 'guest';
export type BoardRole = 'admin' | 'member' | 'observer';

export interface User {
  id: string;
  name: string;
  initials: string;
  color: string;
  email: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface Comment {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  userId: string;
  action: string;
  createdAt: string;
}

export interface Card {
  id: string;
  title: string;
  description: string;
  listId: string;
  boardId: string;
  position: number;
  memberIds: string[];
  labelIds: string[];
  checklists: Checklist[];
  dueDate: string | null;
  dueDateComplete: boolean;
  comments: Comment[];
  activity: ActivityEntry[];
  attachments: string[];
  watching: boolean;
  archived: boolean;
  createdAt: string;
}

export interface List {
  id: string;
  title: string;
  boardId: string;
  position: number;
  archived: boolean;
}

export interface AutomationRule {
  id: string;
  boardId: string;
  name: string;
  trigger: 'card_moved' | 'card_created' | 'due_date_reached' | 'checklist_complete';
  triggerConfig: Record<string, string>;
  action: 'assign_member' | 'add_label' | 'move_to_list' | 'mark_due_complete';
  actionConfig: Record<string, string>;
  enabled: boolean;
}

export interface Board {
  id: string;
  title: string;
  workspaceId: string;
  visibility: Visibility;
  color: string;
  starred: boolean;
  labels: Label[];
}

export interface Workspace {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  visibility: Visibility;
}

export interface Notification {
  id: string;
  userId: string;
  cardId: string;
  boardId: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export type ViewMode = 'board' | 'table' | 'calendar';

export interface AppState {
  workspaces: Workspace[];
  boards: Board[];
  lists: List[];
  cards: Card[];
  users: User[];
  automationRules: AutomationRule[];
  notifications: Notification[];
  currentUserId: string;
  currentWorkspaceId: string | null;
  currentBoardId: string | null;
  activeCardId: string | null;
  searchQuery: string;
  searchOpen: boolean;
  filterLabelIds: string[];
  filterMemberIds: string[];
  filterDue: 'all' | 'overdue' | 'week' | 'month' | 'none';
  viewMode: ViewMode;
  sidebarOpen: boolean;
  automationPanelOpen: boolean;
  settingsOpen: boolean;
}

export type Action =
  | { type: 'SET_CURRENT_WORKSPACE'; payload: string | null }
  | { type: 'SET_CURRENT_BOARD'; payload: string | null }
  | { type: 'SET_ACTIVE_CARD'; payload: string | null }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_SEARCH_OPEN'; payload: boolean }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_AUTOMATION_PANEL'; payload: boolean }
  | { type: 'SET_SETTINGS_OPEN'; payload: boolean }
  | { type: 'SET_FILTER_LABELS'; payload: string[] }
  | { type: 'SET_FILTER_MEMBERS'; payload: string[] }
  | { type: 'SET_FILTER_DUE'; payload: 'all' | 'overdue' | 'week' | 'month' | 'none' }
  | { type: 'ADD_LIST'; payload: { boardId: string; title: string } }
  | { type: 'UPDATE_LIST'; payload: { id: string; title: string } }
  | { type: 'ARCHIVE_LIST'; payload: string }
  | { type: 'RESTORE_LIST'; payload: string }
  | { type: 'ADD_CARD'; payload: { listId: string; boardId: string; title: string } }
  | { type: 'UPDATE_CARD'; payload: Partial<Card> & { id: string } }
  | { type: 'MOVE_CARD'; payload: { cardId: string; toListId: string; toPosition: number } }
  | { type: 'ARCHIVE_CARD'; payload: string }
  | { type: 'RESTORE_CARD'; payload: string }
  | { type: 'DELETE_CARD'; payload: string }
  | { type: 'ADD_COMMENT'; payload: { cardId: string; text: string } }
  | { type: 'ADD_CHECKLIST'; payload: { cardId: string; title: string } }
  | { type: 'TOGGLE_CHECKLIST_ITEM'; payload: { cardId: string; checklistId: string; itemId: string } }
  | { type: 'ADD_CHECKLIST_ITEM'; payload: { cardId: string; checklistId: string; text: string } }
  | { type: 'DELETE_CHECKLIST_ITEM'; payload: { cardId: string; checklistId: string; itemId: string } }
  | { type: 'ADD_BOARD'; payload: { workspaceId: string; title: string; color: string } }
  | { type: 'TOGGLE_BOARD_STAR'; payload: string }
  | { type: 'ADD_AUTOMATION_RULE'; payload: Omit<AutomationRule, 'id'> }
  | { type: 'UPDATE_AUTOMATION_RULE'; payload: Partial<AutomationRule> & { id: string } }
  | { type: 'DELETE_AUTOMATION_RULE'; payload: string }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'MARK_ALL_NOTIFICATIONS_READ' }
  | { type: 'ADD_NOTIFICATION'; payload: Omit<Notification, 'id' | 'createdAt'> }
  | { type: 'MOVE_LIST'; payload: { listId: string; toPosition: number } };
