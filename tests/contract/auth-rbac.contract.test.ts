// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('auth and RBAC contract', () => {
  it('documents the core auth and admin endpoints', () => {
    const contract = readFileSync('specs/001-auth-rbac-backend/contracts/openapi.yaml', 'utf8');
    expect(contract).toContain('/auth/login');
    expect(contract).toContain('/auth/session');
    expect(contract).toContain('/admin/users');
    expect(contract).toContain('/admin/users/{userId}/reset-password');
  });

  it('documents bounded layered access, selected-resource resolution, and scoped membership writes', () => {
    const contract = readFileSync('specs/013-layered-access-membership/contracts/admin-access.openapi.yaml', 'utf8');
    expect(contract).toContain('/api/admin/resources');
    expect(contract).toContain('selectedIds');
    expect(contract).toContain('selectedItems');
    expect(contract).toContain('/api/admin/boards/{boardId}/eligible-users');
    expect(contract).toContain('/api/admin/boards/{boardId}/members/{userId}');
    expect(contract).toContain('workspaceAdminWorkspaceIds');
    expect(contract).toContain('boardAdminBoardIds');
    expect(contract).toContain('enum: [member, observer]');
  });
});
