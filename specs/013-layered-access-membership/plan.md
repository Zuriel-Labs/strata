# Implementation Plan: Layered Administration and Board-Rooted Membership

**Branch**: `fix/post-beta-regressions` | **Date**: 2026-08-25 | **Spec**: [spec.md](./spec.md) | **Issue**: [#29](https://github.com/Broville/strata/issues/29)

## Summary

Introduce dedicated scoped administrator grants, make Board membership the sole collaboration root, expose bounded administrator directories and resource catalogs, and redesign Admin workflows for mixed assignments and safe scoped membership management.

## Technical Context

- **Language**: TypeScript 5.9, Node.js 24-compatible ESM
- **Client**: React 19.2, Tailwind, existing shadcn/Radix primitives
- **Server**: Express 5.2, Zod 4.3
- **Storage**: SQLite through better-sqlite3 12.10
- **Tests**: Vitest, Supertest, Testing Library, Playwright
- **Deployment**: immutable Podman image, homelab Gitea GitOps, ArgoCD canary
- **Scale target**: 250 users, 100 workspaces, 1,000 boards without unbounded initial responses/renders
- **Constraints**: additive migration, legacy preservation, server-enforced RBAC, no production change

## Constitution Check

| Principle | Status | Evidence |
|---|---|---|
| Spec-first and Issue-traceable | PASS | Issue #29, spec and checklists precede code |
| Red → Green → Refactor | PASS planned | failing migration/RBAC/API/component/E2E tests precede implementation |
| Security/authorization/data integrity | PASS planned | server matrix, atomic writes, invalidation, audit, idempotent migration |
| Accessible/responsive/failure-honest UX | PASS planned | keyboard states and 375/768/1280 validation |
| Clean reproducible source | PASS | isolated clean worktree; exact candidate will be frozen before image build |
| Canary-first GitOps | PASS planned | existing production remains unchanged |
| Evidence/documentation | PASS planned | contracts, migration notes, test report, live canary evidence |

No justified constitution exceptions.

## Architecture

### Server

1. Add dedicated grant tables and repository functions.
2. Build authorization from platform role + explicit grants + Board memberships.
3. Derive accessible workspaces from Board memberships and administrative scope.
4. Replace the unbounded Admin directory with bounded search/pagination and selected-user detail.
5. Add bounded resource catalog and eligible-user search.
6. Separate System Administrator account/access mutations from scoped Board membership mutations.
7. Invalidate sessions and audit every authorization change.

### Client

1. Expand session permission types and helpers.
2. Show Admin entry to any effective administrator.
3. Provide bounded People directory with search and pagination.
4. Provide System Admin-only Create User and full Access editor.
5. Provide reusable searchable multi-select pickers for Workspace Admin, Board Admin, and Board membership.
6. Provide scoped membership management for effective boards.
7. Label inherited versus explicit authority.

### Migration

The migration is an idempotent transaction executed during schema initialization. It adds grant tables, migrates legacy admin roles, normalizes legacy Board Administrator membership to Member, materializes Board membership for existing card assignees, and retains the legacy workspace table without using it in new authorization.

## API design

Detailed contract: [contracts/admin-access.openapi.yaml](./contracts/admin-access.openapi.yaml)

Primary surfaces:

- bounded account directory and selected-account detail;
- bounded workspace/board resource catalog;
- System Admin account create/full update;
- eligible existing-user search by board;
- scoped Board membership upsert/delete.

## Validation Strategy

### Red gates

- migration idempotence and legacy preservation;
- permission matrix for mixed grants/non-member administrators;
- session payload derived membership;
- account/resource pagination contracts;
- atomic mixed assignment create/update;
- scoped membership allow/deny and anti-escalation;
- client permission helpers and scalable picker behavior;
- Playwright system/workspace/board admin journeys.

### Green gates

- focused Vitest and Supertest suites;
- `npm run typecheck`;
- `npm run lint`;
- `npm run test`;
- `npm run build`;
- `npm run test:e2e`;
- `npm run test:ci`;
- `npm audit --audit-level=high`;
- legacy SQLite integrity/migration checks;
- live canary UI/API/RBAC checks at 375px, 768px, and 1280px.

## Rollout and rollback

1. Commit and push one exact clean source candidate to the existing unmerged PR.
2. Build/push an immutable image identified by source SHA and digest.
3. Update only `apps/strata-canary/values.yaml` through Gitea.
4. Verify ArgoCD, rollout, logs, events, health, bootstrap, and authorization journeys.
5. Reset ephemeral canary data for user testing.
6. Do not change production.

Before eventual production deployment, capture a database backup because legacy `board_admin` rows normalize to `member`. Application rollback plus restored pre-migration database is the safest rollback path.

## Project Structure

```text
server/src/
  db/schema.ts
  db/repositories.ts
  db/admin-repositories.ts
  rbac/permissions.ts
  rbac/policies.ts
  routes/admin-routes.ts
  auth/session.ts
src/
  components/AdminPanel.tsx
  components/AdminAssignmentPicker.tsx
  lib/auth-context.tsx
  services/admin.ts
  types.ts
server/tests/ and src/**/*.test.tsx
tests/contract/ and tests/e2e/
```

## Complexity Tracking

| Choice | Why needed | Rejected simpler option |
|---|---|---|
| Two grant tables | Strong resource FKs, unique constraints, clear scope queries | One scalar role cannot express mixed scopes |
| Bounded catalog endpoints | Large directories cannot be shipped/rendered eagerly | Existing one-response Admin payload is unbounded |
| Separate membership mutation | Scoped admins must manage collaboration without platform privilege | One full-user PATCH risks privilege escalation |
| Optimistic concurrency token | Full assignment replacement can otherwise lose concurrent edits | Last-write-wins is not failure-honest |
