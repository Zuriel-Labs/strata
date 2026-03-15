# Implementation Plan: Management Menu Inline Editing

**Branch**: `008-management-menu-edit` | **Date**: 2026-03-14 | **Spec**: `specs/008-management-menu-edit/spec.md`

## Summary

Turn workspace and board rows in the Management overlay into inline rename triggers, add the missing workspace context selector to the Boards tab header, and persist title updates through new workspace and board rename API paths while preserving existing create and delete flows.

## Technical Context

**Language/Version**: TypeScript 5.9 on React 19 and Node.js 20+
**Primary Dependencies**: React, Express, Zod, better-sqlite3, Vitest, Testing Library
**Storage**: SQLite-backed workspace and board records served through the existing session/bootstrap payload
**Testing**: Vitest component tests for overlay behavior and targeted server route tests for rename endpoints
**Target Platform**: Browser-based web application on desktop and mobile viewports
**Project Type**: web
**Performance Goals**: Inline edit mode and workspace switching feel immediate within the existing overlay, with rename requests completing in the current API interaction pattern
**Constraints**: Preserve current management overlay styling, keep create/delete flows intact, enforce existing RBAC rules, and avoid schema changes because only title fields are being updated
**Scale/Scope**: Focused management-overlay enhancement touching inline edit state, workspace/board rename APIs, local state updates, and regression coverage

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| Spec-First Development | PASS | Spec 008 exists before implementation begins |
| Test-Driven Quality | PASS | Client and server regression coverage planned for rename behavior |
| Constitution Alignment | PASS | Planned work directly matches the requested management menu behavior |
| Iterative Refinement | PASS | Work is split into API support, inline editing flows, and validation |
| Documentation as Code | PASS | Spec, plan, data model, contracts, quickstart, and tasks are created together |

## Phase 0: Research

### Decision 1: Add dedicated rename endpoints for workspaces and boards
**Decision**: Introduce explicit title update routes for workspaces and boards instead of trying to infer renames through unrelated endpoints.
**Rationale**: The current API exposes create, delete, star, and label operations but no rename path. Dedicated rename routes keep the inline editor behavior straightforward and RBAC-aligned.
**Alternatives Considered**: Client-only optimistic rename without persistence (rejected - not durable), overloaded existing board label or bootstrap routes (rejected - unclear semantics and weaker testability).

### Decision 2: Scope the Boards tab selector to manageable workspace contexts
**Decision**: Build the Boards tab workspace selector from the workspaces available in session state, while still filtering board actions by current management permissions.
**Rationale**: The dropdown should let admins pick which workspace's boards they are editing, but rename and delete actions still need per-workspace and per-board permission checks.
**Alternatives Considered**: Keep all workspaces selectable regardless of management access (rejected - could imply unsupported editing scope), continue using the Workspaces tab as the only selector (rejected - conflicts with the requested inline editing behavior).

## Phase 1: Design & Contracts

### Data Model
See `specs/008-management-menu-edit/data-model.md`.

### API Contracts
See `specs/008-management-menu-edit/contracts/management-menu.md`.

### Quickstart
See `specs/008-management-menu-edit/quickstart.md`.

## Project Structure

No repository restructuring is required. The feature stays inside the existing management overlay, client services/store types, and server workspace/board routes.

### Modified Files

```text
src/
├── components/
│   ├── NavigationOverlay.tsx
│   └── NavigationOverlay.test.tsx
├── services/
│   ├── admin.ts
│   └── data.ts
├── store.tsx
└── types.ts

server/
├── src/
│   ├── db/
│   │   └── repositories.ts
│   └── routes/
│       ├── board-routes.ts
│       └── bootstrap-routes.ts
└── tests/
    ├── crud-routes.test.ts
    └── rbac-routes.test.ts
```

**Structure Decision**: Keep the change within the existing client/server split, add minimal route and reducer support for rename persistence, and verify the overlay behavior with focused regression tests.

## Complexity Tracking

No constitution exceptions required.
