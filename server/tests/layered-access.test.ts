// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, closeDatabase } from '../src/db/database';
import {
  getBoardAdminGrantsForUser,
  getBoardMembershipsForUser,
  getDerivedWorkspaceIdsForUser,
  getUserByUsername,
  getWorkspaceAdminGrantsForUser,
} from '../src/db/repositories';
import { canAccessBoard, canAccessWorkspace, canManageBoard, canManageWorkspace } from '../src/rbac/permissions';

beforeAll(() => {
  process.env.SEED_DATA = 'true';
});

async function authContext(username: string) {
  const db = await createDatabase(':memory:');
  const user = getUserByUsername(db, username);
  if (!user) throw new Error(`Missing user ${username}`);
  return {
    db,
    auth: {
      user,
      session: { id: 'session', userId: user.id, createdAt: '', expiresAt: '', lastSeenAt: '' },
      workspaceAdminGrants: getWorkspaceAdminGrantsForUser(db, user.id),
      boardAdminGrants: getBoardAdminGrantsForUser(db, user.id),
      boardMemberships: getBoardMembershipsForUser(db, user.id),
      derivedWorkspaceIds: getDerivedWorkspaceIdsForUser(db, user.id),
    },
  };
}

describe('layered access permissions', () => {
  afterEach(() => {
    closeDatabase();
  });

  it('lets a workspace administrator manage descendant boards without membership', async () => {
    const { db, auth } = await authContext('alex');
    expect(auth.boardMemberships).toHaveLength(0);
    expect(canManageWorkspace(auth, 'w1')).toBe(true);
    expect(canManageBoard(db, auth, 'b1')).toBe(true);
    expect(canAccessBoard(db, auth, 'b1')).toBe(true);
    expect(canAccessWorkspace(auth, 'w2')).toBe(false);
  });

  it('lets an explicit board administrator manage only the granted board without membership', async () => {
    const { db, auth } = await authContext('marcus');
    expect(auth.boardMemberships.some(membership => membership.boardId === 'b1')).toBe(false);
    expect(canManageBoard(db, auth, 'b1')).toBe(true);
    expect(canManageBoard(db, auth, 'b2')).toBe(false);
    expect(canAccessBoard(db, auth, 'b2')).toBe(true);
    expect(canManageWorkspace(auth, 'w1')).toBe(false);
  });

  it('does not treat a direct legacy workspace member row as access', async () => {
    const { db, auth } = await authContext('priya');
    expect(canAccessWorkspace(auth, 'w2')).toBe(true);
    expect(canAccessBoard(db, auth, 'b1')).toBe(true);
    expect(canAccessBoard(db, auth, 'b2')).toBe(false);
    auth.boardMemberships = auth.boardMemberships.filter(membership => membership.boardId !== 'b3');
    auth.derivedWorkspaceIds = auth.derivedWorkspaceIds.filter(workspaceId => workspaceId !== 'w2');
    expect(canAccessWorkspace(auth, 'w2')).toBe(false);
  });
});
