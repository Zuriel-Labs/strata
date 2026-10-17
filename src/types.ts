export type Visibility = 'private' | 'workspace' | 'public';
export type PlatformRole = 'system_admin' | 'user';
export type WorkspaceRole = 'workspace_admin' | 'member';
export type BoardRole = 'member' | 'observer';
export type ThemePreference = 'dark' | 'light';

export interface User {
  id: string;
  name: string;
  initials: string;
  color: string;
  username: string;
  /** Board collaboration memberships; administrative access is intentionally excluded. */
  boardIds?: string[];
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

export type RichTextNodeType =
  | 'doc'
  | 'paragraph'
  | 'text'
  | 'heading'
  | 'bulletList'
  | 'orderedList'
  | 'listItem'
  | 'blockquote'
  | 'codeBlock'
  | 'hardBreak'
  | 'horizontalRule';

export type RichTextMarkType = 'bold' | 'italic' | 'strike' | 'code' | 'link';

export interface RichTextMark {
  type: RichTextMarkType;
  attrs?: {
    href?: string;
    target?: string;
    rel?: string;
  };
}

export interface RichTextNode {
  type: RichTextNodeType;
  text?: string;
  attrs?: {
    level?: 2 | 3;
    start?: number;
  };
  marks?: RichTextMark[];
  content?: RichTextNode[];
}

export interface RichTextDocument extends RichTextNode {
  type: 'doc';
}

export interface Card {
  id: string;
  title: string;
  description: string;
  descriptionDocument: RichTextDocument;
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
  labelsRevision: number;
}

export interface BoardLabelCollection {
  boardId: string;
  labels: Label[];
  labelsRevision: number;
  maxLabelsPerBoard: number;
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

export interface WorkspaceAdminGrant {
  id: string;
  userId: string;
  workspaceId: string;
  grantedByUserId: string | null;
  createdAt: string;
}

export interface BoardAdminGrant {
  id: string;
  userId: string;
  boardId: string;
  grantedByUserId: string | null;
  createdAt: string;
}

export interface SessionUser extends User {
  platformRole: PlatformRole;
  mustChangePassword: boolean;
  themePreference: ThemePreference;
  defaultWorkspaceId: string | null;
  defaultBoardId: string | null;
}

export interface PermissionSnapshot {
  isSystemAdmin: boolean;
  workspaceAdminGrants?: WorkspaceAdminGrant[];
  boardAdminGrants?: BoardAdminGrant[];
  boardMemberships: BoardMembership[];
  derivedWorkspaceIds?: string[];
  /** @deprecated Legacy client fixtures only; never authoritative. */
  workspaceMemberships?: WorkspaceMembership[];
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

export interface AdminUserSummary {
  id: string;
  name: string;
  initials: string;
  color: string;
  username: string;
  platformRole: PlatformRole;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  counts?: {
    workspaceAdminGrants: number;
    boardAdminGrants: number;
    boardMemberships: number;
    derivedWorkspaces: number;
  };
  /** @deprecated Compatibility fields accepted from pre-layered admin fixtures. */
  themePreference?: ThemePreference;
  defaultWorkspaceId?: string | null;
  defaultBoardId?: string | null;
  workspaceMemberships?: WorkspaceMembership[];
  boardMemberships?: BoardMembership[];
}

export interface AdminUserRecord extends Omit<AdminUserSummary, 'counts'> {
  workspaceAdminGrants: WorkspaceAdminGrant[];
  boardAdminGrants: BoardAdminGrant[];
  boardMemberships: BoardMembership[];
  derivedWorkspaceIds: string[];
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminActorCapabilities {
  canCreateUsers: boolean;
  canManageAccess: boolean;
  canViewAudit: boolean;
  canManageSystemSettings: boolean;
}

export interface LabelPolicySettings {
  maxLabelsPerBoard: number;
  boardsAboveLimit: number;
}

export interface AdminDirectoryResponse {
  users: AdminUserSummary[];
  page?: PageMeta;
  actorCapabilities?: AdminActorCapabilities;
  /** @deprecated Unbounded catalogs were replaced by /api/admin/resources. */
  workspaces?: Array<{ id: string; name: string }>;
  boards?: Array<{ id: string; title: string; workspaceId: string }>;
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

export interface AdminResourceItem {
  id: string;
  name: string;
  kind: 'workspace' | 'board';
  workspaceId: string | null;
  workspaceName: string | null;
}

export interface AdminResourcePage {
  items: AdminResourceItem[];
  selectedItems?: AdminResourceItem[];
  page: PageMeta;
}

export type ViewMode = 'board' | 'table' | 'calendar';

export interface AppState {
  maxLabelsPerBoard: number;
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
  | { type: 'HYDRATE_FROM_SESSION'; payload: AppState }
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
  | { type: 'DELETE_LIST'; payload: string }
  | { type: 'ADD_CARD'; payload: { listId: string; boardId: string; title: string } }
  | { type: 'UPDATE_CARD'; payload: Partial<Card> & { id: string } }
  | { type: 'MOVE_CARD'; payload: { cardId: string; toListId: string; toPosition: number } }
  | { type: 'RESTORE_CARDS'; payload: Card[] | { cards: Card[]; notifications: Notification[] } }
  | { type: 'APPLY_SORTED_LIST_CARDS'; payload: { listId: string; cards: Card[] } }
  | { type: 'APPLY_CARD_FROM_API'; payload: Card }
  | { type: 'ADD_DUPLICATED_CARD_FROM_API'; payload: { sourceCardId: string; card: Card } }
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
  | { type: 'UPDATE_BOARD_FROM_API'; payload: Board }
  | { type: 'UPDATE_BOARD_LABELS'; payload: BoardLabelCollection }
  | { type: 'ADD_WORKSPACE'; payload: Workspace }
  | { type: 'UPDATE_WORKSPACE_FROM_API'; payload: Workspace }
  | { type: 'SET_BOARD_STAR'; payload: { boardId: string; starred: boolean } }
  | { type: 'ADD_AUTOMATION_RULE'; payload: Omit<AutomationRule, 'id' | 'lastRunAt'> }
  | { type: 'ADD_AUTOMATION_RULE_FROM_API'; payload: AutomationRule }
  | { type: 'UPDATE_AUTOMATION_RULE'; payload: Partial<AutomationRule> & { id: string } }
  | { type: 'DELETE_AUTOMATION_RULE'; payload: string }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'MARK_ALL_NOTIFICATIONS_READ' }
  | { type: 'ADD_NOTIFICATION'; payload: Omit<Notification, 'id' | 'createdAt'> }
  | { type: 'MOVE_LIST'; payload: { listId: string; toPosition: number } }
  | { type: 'RESTORE_LISTS'; payload: List[] }
  | { type: 'ADD_LIST_FROM_API'; payload: List }
  | { type: 'ADD_CARD_FROM_API'; payload: Card };
