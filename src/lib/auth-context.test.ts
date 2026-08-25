import { describe, expect, it } from 'vitest';
import { initialState } from '../store';
import type { SessionPayload } from '../types';
import { canManageBoardForSession, canManageWorkspaceForSession } from './auth-context';

function session(input: Partial<SessionPayload['permissions']>): SessionPayload {
  return {
    status: 'authenticated',
    user: {
      id: 'u', name: 'User', initials: 'U', color: '#1234', username: 'user',
      platformRole: 'user', mustChangePassword: false, themePreference: 'dark',
      defaultWorkspaceId: null, defaultBoardId: null,
    },
    permissions: {
      isSystemAdmin: false,
      workspaceAdminGrants: [],
      boardAdminGrants: [],
      boardMemberships: [],
      derivedWorkspaceIds: [],
      ...input,
    },
    appState: initialState,
  };
}

describe('client layered access helpers', () => {
  it('applies global, inherited, and explicit administration independently', () => {
    const global = session({ isSystemAdmin: true });
    expect(canManageWorkspaceForSession(global, 'w2')).toBe(true);
    expect(canManageBoardForSession(global, 'b3')).toBe(true);

    const inherited = session({ workspaceAdminGrants: [{ id: 'wg', userId: 'u', workspaceId: 'w1', grantedByUserId: null, createdAt: '' }] });
    expect(canManageWorkspaceForSession(inherited, 'w1')).toBe(true);
    expect(canManageBoardForSession(inherited, 'b1')).toBe(true);
    expect(canManageBoardForSession(inherited, 'b3')).toBe(false);

    const explicit = session({ boardAdminGrants: [{ id: 'bg', userId: 'u', boardId: 'b3', grantedByUserId: null, createdAt: '' }] });
    expect(canManageBoardForSession(explicit, 'b3')).toBe(true);
    expect(canManageWorkspaceForSession(explicit, 'w2')).toBe(false);
  });

  it('never treats collaboration membership as administrative authority', () => {
    const member = session({ boardMemberships: [{ id: 'bm', userId: 'u', boardId: 'b1', role: 'member', createdAt: '' }], derivedWorkspaceIds: ['w1'] });
    expect(canManageBoardForSession(member, 'b1')).toBe(false);
    expect(canManageWorkspaceForSession(member, 'w1')).toBe(false);
  });
});
