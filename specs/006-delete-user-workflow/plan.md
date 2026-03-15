# Implementation Plan: Admin User Deletion Workflow

**Branch**: `006-delete-user-workflow` | **Date**: 2026-03-14 | **Spec**: `specs/006-delete-user-workflow/spec.md`

## Summary

Add a guarded delete-user flow to the Edit Users panel, back it with an admin-only delete endpoint, and perform cleanup that removes live account references while preserving created platform history. The work spans the admin React UI, the admin service layer, the server's admin repository logic, and targeted client/server regression coverage.

## Technical Context

**Language/Version**: TypeScript 5.9 on React 19 for the client and Node.js 20+ with Express for the server
**Primary Dependencies**: React, Vite, Express, better-sqlite3, Zod, Vitest, Testing Library
**Storage**: SQLite accessed through existing repository helpers and JSON-backed card or automation columns
**Testing**: Vitest for component and server integration tests; existing app/admin tests for client regressions
**Target Platform**: Browser-based web application with desktop and touch interactions
**Project Type**: web
**Performance Goals**: Delete confirmation transitions feel immediate and the delete request completes within the existing admin-panel interaction model without requiring a full page reload
**Constraints**: Preserve authored artifacts, avoid partial deletes, keep existing admin panel navigation/state isolation intact, and follow the requested button labels and destructive copy exactly
**Scale/Scope**: Single admin workflow affecting user-management UI, account cleanup logic, and rendering of deleted-user history across card detail surfaces

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| Spec-First Development | PASS | Spec 006 defines the workflow before implementation begins |
| Test-Driven Quality | PASS | Client and server regression tasks cover destructive flow, safeguards, and reference cleanup |
| Constitution Alignment | PASS | Planned changes stay within the requested deletion scope and safeguard platform integrity |
| Iterative Refinement | PASS | Work is split into UI flow, deletion cleanup, and regression validation phases |
| Documentation as Code | PASS | Spec, plan, research, data model, contracts, quickstart, and tasks are created together |

## Phase 0: Research

### Decision 1: Block self-delete in the admin flow
**Decision**: Reject deletion if the target user matches the currently authenticated admin.
**Rationale**: The request calls for destructive account deletion, but allowing the active admin to delete their own account from the same session risks broken UI state and accidental lockout.
**Alternatives Considered**: Allow self-delete and force logout immediately (rejected - higher lockout risk and more brittle session teardown inside a management panel).

### Decision 2: Preserve historical artifacts but scrub live assignment references
**Decision**: Remove the deleted user's IDs from sessions, memberships, notifications, recovery state, password resets, card member arrays, and automation assignment targets while leaving cards, comments, activity, and attachments intact.
**Rationale**: This matches the requested "obliterate the account but keep created things" behavior and prevents dangling references that would keep assigning or displaying a deleted account as active.
**Alternatives Considered**: Hard-delete any content authored by the user (rejected - conflicts with the requested retention behavior).

### Decision 3: Render missing authors with a deleted-user fallback
**Decision**: When comment or activity user IDs no longer resolve to an active user, render a neutral fallback label and avatar state instead of a blank name.
**Rationale**: Historical content must remain legible after account deletion because authored artifacts are preserved while the account itself is removed.
**Alternatives Considered**: Persist full author snapshots onto every history entry during deletion (rejected - larger schema migration than needed for this feature).

## Phase 1: Design & Contracts

### Data Model
See `specs/006-delete-user-workflow/data-model.md`.

### API Contracts
See `specs/006-delete-user-workflow/contracts/admin-user-delete.openapi.yaml`.

### Quickstart
See `specs/006-delete-user-workflow/quickstart.md`.

## Project Structure

No repository restructuring is required. The feature fits into the existing frontend `src/` app, backend `server/src/` routes and repositories, and the current Vitest test suites.

### Modified Files

```text
src/
├── App.admin.test.tsx
├── components/
│   ├── AdminPanel.tsx
│   └── CardModal.tsx
├── services/
│   └── admin.ts
└── types.ts

server/
├── src/
│   ├── db/
│   │   ├── admin-repositories.ts
│   │   └── repositories.ts
│   ├── routes/
│   │   └── admin-routes.ts
│   └── types.ts
└── tests/
    └── admin-routes.test.ts
```

**Structure Decision**: Use the existing split repository structure with frontend code in `src/` and Express or SQLite logic in `server/src/`, plus focused tests in `src/` and `server/tests/`.

## Complexity Tracking

No constitution exceptions required.
