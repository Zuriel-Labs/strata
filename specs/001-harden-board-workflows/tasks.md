# Tasks: Strata Board Workflow Hardening

## Phase 1: Setup

- [X] T001 Review existing branding, RBAC, label, and automation flow entry points in `index.html`, `src/`, and `server/src/`
- [X] T002 Update shared feature artifacts as implementation decisions tighten in `specs/001-harden-board-workflows/spec.md`, `specs/001-harden-board-workflows/plan.md`, and `specs/001-harden-board-workflows/tasks.md`

## Phase 2: Foundational

- [X] T003 Extend shared automation and board label types in `src/types.ts` and `server/src/types.ts`
- [X] T004 Add server repository and schema support for board label updates, automation conditions, and scheduled execution state in `server/src/db/schema.ts` and `server/src/db/repositories.ts`
- [X] T005 Add named board policy helpers for automation, labels, archive or restore, and card editing in `server/src/rbac/permissions.ts` and `src/lib/auth-context.tsx`
- [X] T006 Add shared automation validation and execution helpers for schedule eligibility, board scoping, and card matching in `server/src/routes/automation-routes.ts` and new supporting server modules under `server/src/`

## Phase 3: User Story 1 - Protect board administration and fix product branding

- [X] T007 [US1] Replace remaining live `FlowBoard` branding in `index.html` and verify route-level user-facing copy stays `Strata`
- [X] T008 [US1] Hide admin-only automation affordances for non-admin board viewers in `src/components/NavigationOverlay.tsx` and `src/components/AutomationPanel.tsx`
- [X] T009 [US1] Hide archive or restore controls for non-admin board viewers in `src/components/BoardView.tsx`, `src/components/Sidebar.tsx`, and `src/components/NavigationOverlay.tsx`
- [X] T010 [US1] Enforce automation and archive or restore permissions plus audit coverage on the server in `server/src/routes/automation-routes.ts`, `server/src/routes/card-routes.ts`, and `server/src/routes/list-routes.ts`
- [X] T011 [P] [US1] Expand route and UI RBAC regression tests in `server/tests/rbac-routes.test.ts` and `src/App.rbac.test.tsx`

## Phase 4: User Story 2 - Manage board labels and simplified card interactions

- [X] T012 [US2] Add board-label mutation API support in `server/src/routes/board-routes.ts` and `server/src/db/repositories.ts`
- [X] T013 [US2] Add board-level `Labels` management UI for board admins in `src/components/BoardView.tsx` and any new supporting component under `src/components/`
- [X] T014 [US2] Validate label removal side effects on cards and automation rules in `server/src/db/repositories.ts` and `server/src/routes/automation-routes.ts`
- [X] T015 [US2] Replace card label toggles with a searchable picker and keep applied-label removal in `src/components/CardModal.tsx`
- [X] T016 [US2] Simplify inline card creation and preserve touch-friendly submission in `src/components/BoardView.tsx`
- [X] T017 [US2] Update member display to initials-only removable avatars in `src/components/CardModal.tsx` and related board card surfaces in `src/components/BoardView.tsx`
- [X] T018 [P] [US2] Add client and server tests for board labels, card label assignments, and streamlined card creation in `src/components/CardModal.test.tsx`, `server/tests/`, and related UI tests

## Phase 5: User Story 3 - Configure richer label-aware automation schedules

- [X] T019 [US3] Extend automation rule API payloads and persistence for conditions and new trigger types in `server/src/routes/automation-routes.ts`, `server/src/db/schema.ts`, and `server/src/db/repositories.ts`
- [X] T020 [US3] Implement the server-side scheduled automation runner and hook it into app startup in new server modules plus `server/src/app.ts` or `server/src/index.ts`
- [X] T021 [US3] Update automation creation and editing UI for schedule triggers, list and label conditions, and terminology cleanup in `src/components/AutomationPanel.tsx` and `src/components/NavigationOverlay.tsx`
- [X] T022 [US3] Update client automation execution logic to honor saved conditions for remaining event-driven triggers in `src/store.tsx`
- [X] T023 [P] [US3] Add automation schedule and label-condition tests in `server/tests/`, `src/`, and `tests/e2e/`

## Final Phase: Polish

- [X] T024 Reconcile any spec, contract, and quickstart drift after implementation in `specs/001-harden-board-workflows/`
- [X] T025 Run lint, unit and integration tests, targeted RBAC coverage, and end-to-end validation; capture results in `tests/reports/`
