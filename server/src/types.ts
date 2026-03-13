import type { AppState } from '../../src/types';

export type PlatformRole = 'system_admin' | 'user';
export type WorkspaceRole = 'workspace_admin' | 'member' | 'guest';
export type BoardRole = 'board_admin' | 'member' | 'observer' | 'guest';

export interface UserRecord {
  id: string;
  name: string;
  initials: string;
  color: string;
  email: string;
  platformRole: PlatformRole;
  passwordHash: string;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
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
  workspaceMemberships: WorkspaceMembershipRecord[];
  boardMemberships: BoardMembershipRecord[];
}

export interface SessionUser {
  id: string;
  name: string;
  initials: string;
  color: string;
  email: string;
  platformRole: PlatformRole;
  mustChangePassword: boolean;
}

export interface PermissionSnapshot {
  isSystemAdmin: boolean;
  workspaceMemberships: WorkspaceMembershipRecord[];
  boardMemberships: BoardMembershipRecord[];
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
