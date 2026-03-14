export type Visibility = 'private' | 'workspace' | 'public';
export type PlatformRole = 'system_admin' | 'user';
export type WorkspaceRole = 'workspace_admin' | 'member';
export type BoardRole = 'board_admin' | 'member' | 'observer';

export interface User {
  id: string;
  name: string;
  initials: string;
  color: string;
  username: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface AutomationConditions {
  listId: string | null;
  labelId: string | null;
}

export type AutomationTrigger =
  | 'card_moved'
  | 'card_created'
  | 'checklist_complete'
  | 'due_date_reached'
  | 'date_time'
  | 'weekday'
  | 'monthly'
  | 'heartbeat';

export interface AutomationTriggerConfig {
  toListId?: string;
  runAt?: string;
  weekdays?: number[];
  time?: string;
  dayOfMonth?: number;
  intervalValue?: number;
  intervalUnit?: 'minutes' | 'hours';
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

export interface Attachment {
  id: string;
  name: string;
  kind: 'file' | 'link';
  url?: string;
  size?: number;
  mimeType?: string;
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
  attachments: Attachment[];
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
  trigger: AutomationTrigger;
  triggerConfig: AutomationTriggerConfig;
  conditions: AutomationConditions;
  action: 'assign_member' | 'add_label' | 'move_to_list' | 'mark_due_complete';
  actionConfig: Record<string, string>;
  enabled: boolean;
  lastRunAt: string | null;
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

export interface WorkspaceMembership {
  id: string;
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  createdAt: string;
}

export interface BoardMembership {
  id: string;
  userId: string;
  boardId: string;
  role: BoardRole;
  createdAt: string;
}

export interface SessionUser extends User {
  platformRole: PlatformRole;
  mustChangePassword: boolean;
}

export interface PermissionSnapshot {
  isSystemAdmin: boolean;
  workspaceMemberships: WorkspaceMembership[];
  boardMemberships: BoardMembership[];
}

export interface SessionPayload {
  status: 'authenticated';
  user: SessionUser;
  permissions: PermissionSnapshot;
  appState: AppState;
}

export interface PasswordChangeRequiredPayload {
  status: 'password-change-required';
  user: SessionUser;
}

export type SessionResponse = SessionPayload | PasswordChangeRequiredPayload;

export interface AdminUserRecord extends SessionUser {
  active: boolean;
  createdAt: string;
  updatedAt: string;
  workspaceMemberships: WorkspaceMembership[];
  boardMemberships: BoardMembership[];
}

export interface AdminDirectoryResponse {
  users: AdminUserRecord[];
  workspaces: Array<{ id: string; name: string }>;
  boards: Array<{ id: string; title: string; workspaceId: string }>;
  auditEvents: Array<{
    id: string;
    actor_user_id: string | null;
    target_user_id: string | null;
    scope_type: string;
    scope_id: string | null;
    action: string;
    outcome: string;
    metadata_json: string;
    created_at: string;
  }>;
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
  searchTimestamp: number;
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
  | { type: 'ADD_ATTACHMENT'; payload: { cardId: string; attachment: Attachment } }
  | { type: 'REMOVE_ATTACHMENT'; payload: { cardId: string; attachmentId: string } }
  | { type: 'ADD_BOARD'; payload: { workspaceId: string; title: string; color: string } }
  | { type: 'ADD_BOARD_FROM_API'; payload: Board }
  | { type: 'UPDATE_BOARD_LABELS'; payload: { boardId: string; labels: Label[] } }
  | { type: 'ADD_WORKSPACE'; payload: Workspace }
  | { type: 'TOGGLE_BOARD_STAR'; payload: string }
  | { type: 'ADD_AUTOMATION_RULE'; payload: Omit<AutomationRule, 'id' | 'lastRunAt'> }
  | { type: 'ADD_AUTOMATION_RULE_FROM_API'; payload: AutomationRule }
  | { type: 'UPDATE_AUTOMATION_RULE'; payload: Partial<AutomationRule> & { id: string } }
  | { type: 'DELETE_AUTOMATION_RULE'; payload: string }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'MARK_ALL_NOTIFICATIONS_READ' }
  | { type: 'ADD_NOTIFICATION'; payload: Omit<Notification, 'id' | 'createdAt'> }
  | { type: 'MOVE_LIST'; payload: { listId: string; toPosition: number } }
  | { type: 'ADD_LIST_FROM_API'; payload: List }
  | { type: 'ADD_CARD_FROM_API'; payload: Card };
