// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, closeDatabase } from '../src/db/database';
import { getBoardAdminGrantsForUser, getBoardMembershipsForUser, getDerivedWorkspaceIdsForUser, getUserByUsername, getWorkspaceAdminGrantsForUser } from '../src/db/repositories';
import { canAccessBoard, canAccessWorkspace, canEditBoardCards, canManageBoard, canManageWorkspace } from '../src/rbac/permissions';
import { canManageUserBoard, canManageUserPlatform, canManageUserWorkspace } from '../src/rbac/policies';

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

describe('rbac permissions', () => {
  afterEach(() => {
    closeDatabase();
  });

  it('grants platform and scoped management correctly', async () => {
    const { db, auth } = await authContext('admin');
    expect(canManageUserPlatform(auth)).toBe(true);
    expect(canManageWorkspace(auth, 'w1')).toBe(true);
    expect(canManageBoard(db, auth, 'b1')).toBe(true);
    expect(canManageUserWorkspace(auth, 'w1')).toBe(true);
    expect(canManageUserBoard(db, auth, 'b1')).toBe(true);
  });

  it('lets workspace admins manage only their workspace scope', async () => {
    const { db, auth } = await authContext('alex');
    expect(canManageUserPlatform(auth)).toBe(false);
    expect(canAccessWorkspace(auth, 'w1')).toBe(true);
    expect(canManageWorkspace(auth, 'w1')).toBe(true);
    expect(canAccessWorkspace(auth, 'w2')).toBe(false);
    expect(canAccessBoard(db, auth, 'b1')).toBe(true);
    expect(canManageBoard(db, auth, 'b1')).toBe(true);
  });

  it('lets board admins manage only their boards', async () => {
    const { db, auth } = await authContext('marcus');
    expect(canManageUserPlatform(auth)).toBe(false);
    expect(canAccessBoard(db, auth, 'b1')).toBe(true);
    expect(canManageBoard(db, auth, 'b1')).toBe(true);
    expect(canAccessBoard(db, auth, 'b2')).toBe(true);
    expect(canManageBoard(db, auth, 'b2')).toBe(false);
  });

  it('grants card editing to exact Board Members but not Observers or out-of-scope users', async () => {
    const priya = await authContext('priya');
    expect(canEditBoardCards(priya.db, priya.auth, 'b1')).toBe(true);
    expect(canEditBoardCards(priya.db, priya.auth, 'b2')).toBe(false);
    closeDatabase();

    const marcus = await authContext('marcus');
    expect(canEditBoardCards(marcus.db, marcus.auth, 'b1')).toBe(true);
    expect(canEditBoardCards(marcus.db, marcus.auth, 'b2')).toBe(false);
  });
});
