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
});
