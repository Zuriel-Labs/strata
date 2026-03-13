// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, closeDatabase } from '../src/db/database';
import { getBoardMembershipsForUser, getUserByEmail, getWorkspaceMembershipsForUser } from '../src/db/repositories';
import { canAccessBoard, canAccessWorkspace, canManageBoard, canManageWorkspace } from '../src/rbac/permissions';
import { canManageUserBoard, canManageUserPlatform, canManageUserWorkspace } from '../src/rbac/policies';

async function authContext(email: string) {
  const db = await createDatabase(':memory:');
  const user = getUserByEmail(db, email);
  if (!user) throw new Error(`Missing user ${email}`);
  return {
    db,
    auth: {
      user,
      session: { id: 'session', userId: user.id, createdAt: '', expiresAt: '', lastSeenAt: '' },
      workspaceMemberships: getWorkspaceMembershipsForUser(db, user.id),
      boardMemberships: getBoardMembershipsForUser(db, user.id),
    },
  };
}

describe('rbac permissions', () => {
  afterEach(() => {
    closeDatabase();
  });

  it('grants platform and scoped management correctly', async () => {
    const { db, auth } = await authContext('admin@strata.local');
    expect(canManageUserPlatform(auth)).toBe(true);
    expect(canManageWorkspace(auth, 'w1')).toBe(true);
    expect(canManageBoard(db, auth, 'b1')).toBe(true);
    expect(canManageUserWorkspace(auth, 'w1')).toBe(true);
    expect(canManageUserBoard(db, auth, 'b1')).toBe(true);
  });

  it('lets workspace admins manage only their workspace scope', async () => {
    const { db, auth } = await authContext('alex@company.io');
    expect(canManageUserPlatform(auth)).toBe(false);
    expect(canAccessWorkspace(auth, 'w1')).toBe(true);
    expect(canManageWorkspace(auth, 'w1')).toBe(true);
    expect(canAccessWorkspace(auth, 'w2')).toBe(false);
    expect(canAccessBoard(db, auth, 'b1')).toBe(true);
    expect(canManageBoard(db, auth, 'b1')).toBe(true);
  });

  it('lets board admins manage only their boards', async () => {
    const { db, auth } = await authContext('marcus@company.io');
    expect(canManageUserPlatform(auth)).toBe(false);
    expect(canAccessBoard(db, auth, 'b1')).toBe(true);
    expect(canManageBoard(db, auth, 'b1')).toBe(true);
    expect(canAccessBoard(db, auth, 'b2')).toBe(true);
    expect(canManageBoard(db, auth, 'b2')).toBe(false);
  });
});
