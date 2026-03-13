import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AppState, AutomationRule, Board, Card, List, Notification, User, Workspace } from '../../../src/types';
import type { AuditEventInput, BoardMembershipRecord, SessionPayload, SessionRecord, SessionUser, UserRecord, WorkspaceMembershipRecord } from '../types';

type JsonRow<T> = T & { [key: string]: unknown };

function asBool(value: number) {
  return Boolean(value);
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function mapUser(row: Record<string, unknown>): UserRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    initials: String(row.initials),
    color: String(row.color),
    email: String(row.email),
    platformRole: row.platform_role === 'system_admin' ? 'system_admin' : 'user',
    passwordHash: String(row.password_hash),
    active: asBool(Number(row.active)),
    mustChangePassword: asBool(Number(row.must_change_password)),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapSession(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    lastSeenAt: String(row.last_seen_at),
  };
}

function mapWorkspaceMembership(row: Record<string, unknown>): WorkspaceMembershipRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    workspaceId: String(row.workspace_id),
    role: row.role as WorkspaceMembershipRecord['role'],
    createdAt: String(row.created_at),
  };
}

function mapBoardMembership(row: Record<string, unknown>): BoardMembershipRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    boardId: String(row.board_id),
    role: row.role as BoardMembershipRecord['role'],
    createdAt: String(row.created_at),
  };
}

export function getUserByEmail(db: Database.Database, email: string) {
  const row = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email) as Record<string, unknown> | undefined;
  return row ? mapUser(row) : null;
}

export function getUserById(db: Database.Database, userId: string) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown> | undefined;
  return row ? mapUser(row) : null;
}

export function listUsers(db: Database.Database) {
  const rows = db.prepare('SELECT * FROM users ORDER BY name ASC').all() as Record<string, unknown>[];
  return rows.map(mapUser);
}

export function countSystemAdmins(db: Database.Database) {
  const row = db.prepare("SELECT COUNT(*) as count FROM users WHERE platform_role = 'system_admin' AND active = 1").get() as { count: number };
  return row.count;
}

export function updateUserPassword(db: Database.Database, userId: string, passwordHash: string, mustChangePassword: boolean) {
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = ?, updated_at = ? WHERE id = ?').run(passwordHash, mustChangePassword ? 1 : 0, new Date().toISOString(), userId);
}

export function upsertPasswordReset(db: Database.Database, userId: string, issuedByUserId: string, temporaryPasswordHash: string) {
  db.prepare(`
    INSERT INTO password_resets (user_id, temporary_password_hash, issued_by_user_id, issued_at, consumed_at)
    VALUES (?, ?, ?, ?, NULL)
    ON CONFLICT(user_id) DO UPDATE SET
      temporary_password_hash = excluded.temporary_password_hash,
      issued_by_user_id = excluded.issued_by_user_id,
      issued_at = excluded.issued_at,
      consumed_at = NULL
  `).run(userId, temporaryPasswordHash, issuedByUserId, new Date().toISOString());
}

export function consumePasswordReset(db: Database.Database, userId: string) {
  db.prepare('UPDATE password_resets SET consumed_at = ? WHERE user_id = ?').run(new Date().toISOString(), userId);
}

export function createSession(db: Database.Database, userId: string, ttlMs = 1000 * 60 * 60 * 24) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run(id, userId, expiresAt, createdAt, createdAt);
  return { id, userId, expiresAt, createdAt, lastSeenAt: createdAt } satisfies SessionRecord;
}

export function getSession(db: Database.Database, sessionId: string) {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const session = mapSession(row);
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    deleteSession(db, sessionId);
    return null;
  }
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), sessionId);
  return session;
}

export function deleteSession(db: Database.Database, sessionId: string) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function getWorkspaceMembershipsForUser(db: Database.Database, userId: string) {
  const rows = db.prepare('SELECT * FROM workspace_memberships WHERE user_id = ?').all(userId) as Record<string, unknown>[];
  return rows.map(mapWorkspaceMembership);
}

export function getBoardMembershipsForUser(db: Database.Database, userId: string) {
  const rows = db.prepare('SELECT * FROM board_memberships WHERE user_id = ?').all(userId) as Record<string, unknown>[];
  return rows.map(mapBoardMembership);
}

function getAccessibleWorkspaceIds(db: Database.Database, user: UserRecord, workspaceMemberships: WorkspaceMembershipRecord[], boardMemberships: BoardMembershipRecord[]) {
  if (user.platformRole === 'system_admin') {
    const rows = db.prepare('SELECT id FROM workspaces').all() as Array<{ id: string }>;
    return rows.map(row => row.id);
  }
  const ids = new Set(workspaceMemberships.map(item => item.workspaceId));
  if (boardMemberships.length > 0) {
    const placeholders = boardMemberships.map(() => '?').join(', ');
    const rows = db.prepare(`SELECT DISTINCT workspace_id as workspaceId FROM boards WHERE id IN (${placeholders})`).all(...boardMemberships.map(item => item.boardId)) as Array<{ workspaceId: string }>;
    for (const row of rows) ids.add(row.workspaceId);
  }
  return [...ids];
}

function getAccessibleBoardIds(db: Database.Database, user: UserRecord, workspaceIds: string[], boardMemberships: BoardMembershipRecord[]) {
  if (user.platformRole === 'system_admin') {
    const rows = db.prepare('SELECT id FROM boards').all() as Array<{ id: string }>;
    return rows.map(row => row.id);
  }
  const ids = new Set(boardMemberships.map(item => item.boardId));
  if (workspaceIds.length > 0) {
    const placeholders = workspaceIds.map(() => '?').join(', ');
    const rows = db.prepare(`SELECT id FROM boards WHERE workspace_id IN (${placeholders})`).all(...workspaceIds) as Array<{ id: string }>;
    for (const row of rows) ids.add(row.id);
  }
  return [...ids];
}

function selectWorkspaces(db: Database.Database, workspaceIds: string[]) {
  if (workspaceIds.length === 0) return [] as Workspace[];
  const placeholders = workspaceIds.map(() => '?').join(', ');
  return (db.prepare(`SELECT * FROM workspaces WHERE id IN (${placeholders}) ORDER BY name ASC`).all(...workspaceIds) as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    memberIds: [],
    visibility: row.visibility as Workspace['visibility'],
  }));
}

function selectBoards(db: Database.Database, boardIds: string[]) {
  if (boardIds.length === 0) return [] as Board[];
  const placeholders = boardIds.map(() => '?').join(', ');
  return (db.prepare(`SELECT * FROM boards WHERE id IN (${placeholders}) ORDER BY title ASC`).all(...boardIds) as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    title: String(row.title),
    workspaceId: String(row.workspace_id),
    visibility: row.visibility as Board['visibility'],
    color: String(row.color),
    starred: asBool(Number(row.starred)),
    labels: parseJson<Board['labels']>(String(row.labels_json)),
  }));
}

function selectLists(db: Database.Database, boardIds: string[]) {
  if (boardIds.length === 0) return [] as List[];
  const placeholders = boardIds.map(() => '?').join(', ');
  return (db.prepare(`SELECT * FROM lists WHERE board_id IN (${placeholders}) ORDER BY position ASC`).all(...boardIds) as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    title: String(row.title),
    boardId: String(row.board_id),
    position: Number(row.position),
    archived: asBool(Number(row.archived)),
  }));
}

function selectCards(db: Database.Database, boardIds: string[]) {
  if (boardIds.length === 0) return [] as Card[];
  const placeholders = boardIds.map(() => '?').join(', ');
  return (db.prepare(`SELECT * FROM cards WHERE board_id IN (${placeholders}) ORDER BY position ASC`).all(...boardIds) as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    listId: String(row.list_id),
    boardId: String(row.board_id),
    position: Number(row.position),
    memberIds: parseJson<Card['memberIds']>(String(row.member_ids_json)),
    labelIds: parseJson<Card['labelIds']>(String(row.label_ids_json)),
    checklists: parseJson<Card['checklists']>(String(row.checklists_json)),
    dueDate: row.due_date ? String(row.due_date) : null,
    dueDateComplete: asBool(Number(row.due_date_complete)),
    comments: parseJson<Card['comments']>(String(row.comments_json)),
    activity: parseJson<Card['activity']>(String(row.activity_json)),
    attachments: parseJson<Card['attachments']>(String(row.attachments_json)),
    watching: asBool(Number(row.watching)),
    archived: asBool(Number(row.archived)),
    createdAt: String(row.created_at),
  }));
}

function selectNotifications(db: Database.Database, userId: string, boardIds: string[]) {
  if (boardIds.length === 0) return [] as Notification[];
  const placeholders = boardIds.map(() => '?').join(', ');
  return (db.prepare(`SELECT * FROM notifications WHERE user_id = ? AND board_id IN (${placeholders}) ORDER BY created_at DESC`).all(userId, ...boardIds) as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    userId: String(row.user_id),
    cardId: String(row.card_id),
    boardId: String(row.board_id),
    message: String(row.message),
    read: asBool(Number(row.read)),
    createdAt: String(row.created_at),
  }));
}

function selectAutomationRules(db: Database.Database, boardIds: string[]) {
  if (boardIds.length === 0) return [] as AutomationRule[];
  const placeholders = boardIds.map(() => '?').join(', ');
  return (db.prepare(`SELECT * FROM automation_rules WHERE board_id IN (${placeholders}) ORDER BY name ASC`).all(...boardIds) as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    boardId: String(row.board_id),
    name: String(row.name),
    trigger: row.trigger as AutomationRule['trigger'],
    triggerConfig: parseJson<AutomationRule['triggerConfig']>(String(row.trigger_config_json)),
    action: row.action as AutomationRule['action'],
    actionConfig: parseJson<AutomationRule['actionConfig']>(String(row.action_config_json)),
    enabled: asBool(Number(row.enabled)),
  }));
}

function selectScopedUsers(db: Database.Database, user: UserRecord, workspaceIds: string[], boardIds: string[]) {
  if (user.platformRole === 'system_admin') {
    return listUsers(db).map(safeUser => ({
      id: safeUser.id,
      name: safeUser.name,
      initials: safeUser.initials,
      color: safeUser.color,
      email: safeUser.email,
    }));
  }

  const userIds = new Set<string>([user.id]);
  if (workspaceIds.length > 0) {
    const placeholders = workspaceIds.map(() => '?').join(', ');
    const rows = db.prepare(`SELECT DISTINCT user_id as userId FROM workspace_memberships WHERE workspace_id IN (${placeholders})`).all(...workspaceIds) as Array<{ userId: string }>;
    rows.forEach(row => userIds.add(row.userId));
  }
  if (boardIds.length > 0) {
    const placeholders = boardIds.map(() => '?').join(', ');
    const rows = db.prepare(`SELECT DISTINCT user_id as userId FROM board_memberships WHERE board_id IN (${placeholders})`).all(...boardIds) as Array<{ userId: string }>;
    rows.forEach(row => userIds.add(row.userId));
  }
  const placeholders = [...userIds].map(() => '?').join(', ');
  const rows = db.prepare(`SELECT id, name, initials, color, email FROM users WHERE id IN (${placeholders}) ORDER BY name ASC`).all(...userIds) as User[];
  return rows;
}

export function buildSessionPayload(db: Database.Database, user: UserRecord): SessionPayload {
  const workspaceMemberships = getWorkspaceMembershipsForUser(db, user.id);
  const boardMemberships = getBoardMembershipsForUser(db, user.id);
  const workspaceIds = getAccessibleWorkspaceIds(db, user, workspaceMemberships, boardMemberships);
  const boardIds = getAccessibleBoardIds(db, user, workspaceIds, boardMemberships);
  const workspaces = selectWorkspaces(db, workspaceIds);
  const boards = selectBoards(db, boardIds);
  const lists = selectLists(db, boardIds);
  const cards = selectCards(db, boardIds);
  const notifications = selectNotifications(db, user.id, boardIds);
  const automationRules = selectAutomationRules(db, boardIds);
  const users = selectScopedUsers(db, user, workspaceIds, boardIds);

  const workspaceMemberMap = new Map<string, string[]>();
  for (const membership of db.prepare('SELECT workspace_id as workspaceId, user_id as userId FROM workspace_memberships').all() as Array<{ workspaceId: string; userId: string }>) {
    const list = workspaceMemberMap.get(membership.workspaceId) ?? [];
    list.push(membership.userId);
    workspaceMemberMap.set(membership.workspaceId, list);
  }

  const currentWorkspaceId = workspaces[0]?.id ?? null;
  const currentBoardId = boards.find(board => board.workspaceId === currentWorkspaceId)?.id ?? boards[0]?.id ?? null;
  const appState: AppState = {
    workspaces: workspaces.map(workspace => ({ ...workspace, memberIds: workspaceMemberMap.get(workspace.id) ?? [] })),
    boards,
    lists,
    cards,
    users,
    automationRules,
    notifications,
    currentUserId: user.id,
    currentWorkspaceId,
    currentBoardId,
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

  const safeUser: SessionUser = {
    id: user.id,
    name: user.name,
    initials: user.initials,
    color: user.color,
    email: user.email,
    platformRole: user.platformRole,
    mustChangePassword: user.mustChangePassword,
  };

  return {
    status: 'authenticated',
    user: safeUser,
    permissions: {
      isSystemAdmin: user.platformRole === 'system_admin',
      workspaceMemberships,
      boardMemberships,
    },
    appState,
  };
}

export function createAuditEvent(db: Database.Database, input: AuditEventInput) {
  db.prepare(`
    INSERT INTO audit_events (id, actor_user_id, target_user_id, scope_type, scope_id, action, outcome, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    input.actorUserId ?? null,
    input.targetUserId ?? null,
    input.scopeType,
    input.scopeId ?? null,
    input.action,
    input.outcome,
    JSON.stringify(input.metadata ?? {}),
    new Date().toISOString(),
  );
}

export function listAuditEvents(db: Database.Database) {
  return db.prepare('SELECT * FROM audit_events ORDER BY created_at DESC').all() as JsonRow<Record<string, unknown>>[];
}
