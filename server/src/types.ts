import type { AppState } from '../../src/types';

export type PlatformRole = 'system_admin' | 'user';
export type WorkspaceRole = 'workspace_admin' | 'member';
export type BoardRole = 'member' | 'observer';
export type ThemePreference = 'dark' | 'light';

export interface UserRecord {
  id: string;
  name: string;
  initials: string;
  color: string;
  themePreference: ThemePreference;
  username: string;
  platformRole: PlatformRole;
  passwordHash: string;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  defaultWorkspaceId: string | null;
  defaultBoardId: string | null;
}

export interface WorkspaceMembershipRecord {
  id: string;
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  createdAt: string;
}

export interface BoardMembershipRecord {
  id: string;
  userId: string;
  boardId: string;
  role: BoardRole;
  createdAt: string;
}

export interface WorkspaceAdminGrantRecord {
  id: string;
  userId: string;
  workspaceId: string;
  grantedByUserId: string | null;
  createdAt: string;
}

export interface BoardAdminGrantRecord {
  id: string;
  userId: string;
  boardId: string;
  grantedByUserId: string | null;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface AuditEventInput {
  actorUserId?: string | null;
  targetUserId?: string | null;
  scopeType: 'platform' | 'workspace' | 'board' | 'auth';
  scopeId?: string | null;
  action: string;
  outcome: 'success' | 'failure';
  metadata?: Record<string, unknown>;
}

export interface AuthContextValue {
  user: UserRecord;
  session: SessionRecord;
  workspaceAdminGrants: WorkspaceAdminGrantRecord[];
  boardAdminGrants: BoardAdminGrantRecord[];
  boardMemberships: BoardMembershipRecord[];
  derivedWorkspaceIds: string[];
}

export interface SessionUser {
  id: string;
  name: string;
  initials: string;
  color: string;
  themePreference: ThemePreference;
  username: string;
  platformRole: PlatformRole;
  mustChangePassword: boolean;
  defaultWorkspaceId: string | null;
  defaultBoardId: string | null;
}

export interface RecoveryKeyRecord {
  id: string;
  userId: string;
  keyHash: string;
  createdAt: string;
}

export interface PermissionSnapshot {
  isSystemAdmin: boolean;
  workspaceAdminGrants: WorkspaceAdminGrantRecord[];
  boardAdminGrants: BoardAdminGrantRecord[];
  boardMemberships: BoardMembershipRecord[];
  derivedWorkspaceIds: string[];
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
