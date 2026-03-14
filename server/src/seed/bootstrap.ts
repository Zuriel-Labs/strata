import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { hashPassword } from '../auth/passwords';
import type { BoardRole, PlatformRole, WorkspaceRole } from '../types';
import { USERS, WORKSPACES, BOARDS, LISTS, CARDS, AUTOMATION_RULES, NOTIFICATIONS } from '../../../src/data';

const now = () => new Date().toISOString();

type UserSeed = {
  id: string;
  name: string;
  initials: string;
  color: string;
  username: string;
  platformRole: PlatformRole;
  password: string;
  active: boolean;
  mustChangePassword: boolean;
};

const seededUsers: UserSeed[] = [
  {
    ...USERS[0],
    username: 'admin',
    name: 'System Admin',
    initials: 'SA',
    platformRole: 'system_admin',
    password: 'ChangeMe123!',
    active: true,
    mustChangePassword: true,
  },
  { ...USERS[1], username: 'alex', platformRole: 'user', password: 'WorkspaceAdmin123!', active: true, mustChangePassword: false },
  { ...USERS[2], username: 'priya', platformRole: 'user', password: 'Member12345!', active: true, mustChangePassword: false },
  { ...USERS[3], username: 'marcus', platformRole: 'user', password: 'BoardAdmin123!', active: true, mustChangePassword: false },
];

const workspaceMemberships: Array<{ userId: string; workspaceId: string; role: WorkspaceRole }> = [
  { userId: 'u1', workspaceId: 'w1', role: 'workspace_admin' },
  { userId: 'u1', workspaceId: 'w2', role: 'workspace_admin' },
  { userId: 'u2', workspaceId: 'w1', role: 'workspace_admin' },
  { userId: 'u3', workspaceId: 'w1', role: 'member' },
  { userId: 'u3', workspaceId: 'w2', role: 'member' },
  { userId: 'u4', workspaceId: 'w1', role: 'member' },
];

const boardMemberships: Array<{ userId: string; boardId: string; role: BoardRole }> = [
  { userId: 'u1', boardId: 'b1', role: 'board_admin' },
  { userId: 'u1', boardId: 'b2', role: 'board_admin' },
  { userId: 'u1', boardId: 'b3', role: 'board_admin' },
  { userId: 'u2', boardId: 'b1', role: 'board_admin' },
  { userId: 'u2', boardId: 'b2', role: 'board_admin' },
  { userId: 'u3', boardId: 'b1', role: 'member' },
  { userId: 'u3', boardId: 'b3', role: 'member' },
  { userId: 'u4', boardId: 'b1', role: 'board_admin' },
  { userId: 'u4', boardId: 'b2', role: 'observer' },
];

export async function seedIfNeeded(db: Database.Database) {
  if (process.env.SEED_DATA !== 'true') return;

  const existing = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (existing.count > 0) return;

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, initials, color, username, platform_role, password_hash, active, must_change_password, created_at, updated_at)
    VALUES (@id, @name, @initials, @color, @username, @platformRole, @passwordHash, @active, @mustChangePassword, @createdAt, @updatedAt)
  `);

  for (const user of seededUsers) {
    const passwordHash = await hashPassword(user.password);
    const createdAt = now();
    insertUser.run({
      ...user,
      passwordHash,
      active: user.active ? 1 : 0,
      mustChangePassword: user.mustChangePassword ? 1 : 0,
      createdAt,
      updatedAt: createdAt,
    });
  }

  const insertWorkspace = db.prepare('INSERT INTO workspaces (id, name, description, visibility, created_at) VALUES (@id, @name, @description, @visibility, @created_at)');
  for (const workspace of WORKSPACES) {
    insertWorkspace.run({ ...workspace, created_at: now() });
  }

  const insertWorkspaceMembership = db.prepare('INSERT INTO workspace_memberships (id, user_id, workspace_id, role, created_at) VALUES (@id, @userId, @workspaceId, @role, @createdAt)');
  for (const membership of workspaceMemberships) {
    insertWorkspaceMembership.run({ id: randomUUID(), ...membership, createdAt: now() });
  }

  const insertBoard = db.prepare('INSERT INTO boards (id, title, workspace_id, visibility, color, starred, labels_json, created_at) VALUES (@id, @title, @workspaceId, @visibility, @color, @starred, @labelsJson, @createdAt)');
  for (const board of BOARDS) {
    insertBoard.run({
      id: board.id,
      title: board.title,
      workspaceId: board.workspaceId,
      visibility: board.visibility,
      color: board.color,
      starred: board.starred ? 1 : 0,
      labelsJson: JSON.stringify(board.labels),
      createdAt: now(),
    });
  }

  const insertBoardMembership = db.prepare('INSERT INTO board_memberships (id, user_id, board_id, role, created_at) VALUES (@id, @userId, @boardId, @role, @createdAt)');
  for (const membership of boardMemberships) {
    insertBoardMembership.run({ id: randomUUID(), ...membership, createdAt: now() });
  }

  const insertList = db.prepare('INSERT INTO lists (id, title, board_id, position, archived, created_at) VALUES (@id, @title, @boardId, @position, @archived, @createdAt)');
  for (const list of LISTS) {
    insertList.run({
      id: list.id,
      title: list.title,
      boardId: list.boardId,
      position: list.position,
      archived: list.archived ? 1 : 0,
      createdAt: now(),
    });
  }

  const insertCard = db.prepare(`
    INSERT INTO cards (id, title, description, list_id, board_id, position, member_ids_json, label_ids_json, checklists_json, due_date, due_date_complete, comments_json, activity_json, attachments_json, watching, archived, created_at)
    VALUES (@id, @title, @description, @listId, @boardId, @position, @memberIdsJson, @labelIdsJson, @checklistsJson, @dueDate, @dueDateComplete, @commentsJson, @activityJson, @attachmentsJson, @watching, @archived, @createdAt)
  `);
  for (const card of CARDS) {
    insertCard.run({
      id: card.id,
      title: card.title,
      description: card.description,
      listId: card.listId,
      boardId: card.boardId,
      position: card.position,
      memberIdsJson: JSON.stringify(card.memberIds),
      labelIdsJson: JSON.stringify(card.labelIds),
      checklistsJson: JSON.stringify(card.checklists),
      dueDate: card.dueDate,
      dueDateComplete: card.dueDateComplete ? 1 : 0,
      commentsJson: JSON.stringify(card.comments),
      activityJson: JSON.stringify(card.activity),
      attachmentsJson: JSON.stringify(card.attachments),
      watching: card.watching ? 1 : 0,
      archived: card.archived ? 1 : 0,
      createdAt: card.createdAt,
    });
  }

  const insertRule = db.prepare(`
    INSERT INTO automation_rules (id, board_id, name, trigger, trigger_config_json, action, action_config_json, enabled)
    VALUES (@id, @boardId, @name, @trigger, @triggerConfigJson, @action, @actionConfigJson, @enabled)
  `);
  for (const rule of AUTOMATION_RULES) {
    insertRule.run({
      id: rule.id,
      boardId: rule.boardId,
      name: rule.name,
      trigger: rule.trigger,
      triggerConfigJson: JSON.stringify(rule.triggerConfig),
      action: rule.action,
      actionConfigJson: JSON.stringify(rule.actionConfig),
      enabled: rule.enabled ? 1 : 0,
    });
  }

  const insertNotification = db.prepare(`
    INSERT INTO notifications (id, user_id, card_id, board_id, message, read, created_at)
    VALUES (@id, @userId, @cardId, @boardId, @message, @read, @createdAt)
  `);
  for (const notification of NOTIFICATIONS) {
    insertNotification.run({
      id: notification.id,
      userId: notification.userId,
      cardId: notification.cardId,
      boardId: notification.boardId,
      message: notification.message,
      read: notification.read ? 1 : 0,
      createdAt: notification.createdAt,
    });
  }
}
