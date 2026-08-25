# Tasks: Layered Administration and Board-Rooted Membership

## Phase 1 — Setup and evidence

- [x] T001 Record clean branch/head and Issue #29 claim in `specs/013-layered-access-membership/quickstart.md`
- [x] T002 [P] Add research citations and repository root-cause evidence in `specs/013-layered-access-membership/research.md`
- [x] T003 [P] Finalize API contract in `specs/013-layered-access-membership/contracts/admin-access.openapi.yaml`

## Phase 2 — Foundational migration and domain types

- [x] T004 [US4] Add failing legacy migration/idempotence/preservation tests in `server/tests/layered-access-migration.test.ts`
- [x] T005 [US4] Add failing cascade and role-normalization tests in `server/tests/layered-access-migration.test.ts`
- [x] T006 [US1] Add failing grant repository tests in `server/tests/layered-access.test.ts`
- [x] T007 [US4] Add grant tables, foreign keys, uniqueness, indexes, and idempotent migration in `server/src/db/schema.ts`
- [x] T008 [US4] Migrate legacy admin roles and normalize legacy Board Administrator membership in `server/src/db/schema.ts`
- [x] T009 [US1] Define grant and normalized membership records in `server/src/types.ts` and `src/types.ts`
- [x] T010 [US1] Implement grant/membership mappers and repositories in `server/src/db/repositories.ts`
- [x] T011 [US4] Update seed data to separate grants from membership in `server/src/seed/bootstrap.ts`

## Phase 3 — User Story 1: Mixed administrative authority

- [x] T012 [US1] Add failing mixed-grant and non-member-admin permission matrix tests in `server/tests/permissions.test.ts`
- [x] T013 [US1] Add failing session snapshot/access-scope tests in `server/tests/rbac-matrix.test.ts`
- [x] T014 [US1] Replace membership-based admin checks with grant-based checks in `server/src/rbac/permissions.ts`
- [x] T015 [US1] Update user-management policies in `server/src/rbac/policies.ts`
- [x] T016 [US1] Load grants into request auth context in `server/src/auth/session.ts`
- [x] T017 [US1] Derive accessible workspaces/boards and workspace member IDs from grants and Board memberships in `server/src/db/repositories.ts`
- [x] T018 [US1] Emit the new permission snapshot in `server/src/db/repositories.ts`
- [x] T019 [US1] Update client permission snapshot and helpers in `src/lib/auth-context.tsx`
- [x] T020 [US1] Add client helper tests for global, inherited, explicit, and membership-only access in `src/lib/auth-context.test.ts`

## Phase 4 — User Story 3: Bounded directories and resource catalogs

- [x] T021 [US3] Add failing pagination/search/scope tests in `server/tests/admin-access-routes.test.ts`
- [x] T022 [US3] Add failing 250-user/100-workspace/1,000-board bounded-query tests in `server/tests/admin-access-routes.test.ts`
- [x] T023 [US3] Implement deterministic bounded directory queries in `server/src/db/admin-repositories.ts`
- [x] T024 [US3] Implement bounded workspace/board resource catalog queries in `server/src/db/admin-repositories.ts`
- [x] T025 [US3] Add validated pagination/search query schemas and routes in `server/src/routes/admin-routes.ts`
- [x] T026 [US3] Update client Admin service pagination/resource contracts in `src/services/admin.ts`
- [x] T027 [US3] Add contract tests for bounded pages and selected-user detail in `tests/contract/auth-rbac.contract.test.ts`

## Phase 5 — User Story 1: Atomic account/access management

- [x] T028 [US1] Add failing create/update mixed-assignment atomicity tests in `server/tests/admin-access-routes.test.ts`
- [x] T029 [US1] Add failing invalid/duplicate/unknown/stale assignment tests in `server/tests/admin-access-routes.test.ts`
- [x] T030 [US5] Add failing session invalidation and audit-diff tests in `server/tests/admin-access-routes.test.ts`
- [x] T031 [US1] Implement transactional grant/membership replacement and optimistic concurrency in `server/src/db/admin-repositories.ts`
- [x] T032 [US1] Validate all referenced resources and duplicates before writes in `server/src/routes/admin-routes.ts`
- [x] T033 [US5] Invalidate target sessions and append scoped non-secret audit evidence in `server/src/routes/admin-routes.ts`
- [x] T034 [US1] Preserve last-active-System-Administrator safeguards in `server/src/db/admin-repositories.ts`

## Phase 6 — User Story 2: Scoped Board membership administration

- [x] T035 [US2] Add failing System/Workspace/Board/regular membership authorization tests in `server/tests/admin-access-routes.test.ts`
- [x] T036 [US2] Add failing eligible-user exclusion, inactive-user, and out-of-scope tests in `server/tests/admin-access-routes.test.ts`
- [x] T037 [US2] Implement eligible-user bounded search in `server/src/db/admin-repositories.ts`
- [x] T038 [US2] Implement scoped Board membership upsert/delete transactions in `server/src/db/admin-repositories.ts`
- [x] T039 [US2] Add membership routes with server anti-escalation checks in `server/src/routes/admin-routes.ts`
- [x] T040 [US5] Invalidate sessions and audit membership changes in `server/src/routes/admin-routes.ts`
- [x] T041 [US2] Add client membership service calls in `src/services/admin.ts`

## Phase 7 — User Story 3: Scalable Admin UX

- [x] T042 [US3] Add failing searchable multi-select/persistent-selection component tests in `src/components/AdminAssignmentPicker.test.tsx`
- [x] T043 [US3] Implement accessible bounded assignment picker in `src/components/AdminAssignmentPicker.tsx`
- [x] T044 [US3] Add failing Admin directory pagination and role-summary tests in `src/App.admin.test.tsx`
- [x] T045 [US1] Add failing Create/Edit mixed-access tests in `src/App.admin.test.tsx`
- [x] T046 [US2] Add failing scoped membership UI/hidden privileged action tests in `src/App.admin.test.tsx`
- [x] T047 [US3] Refactor Admin panel into bounded People/Create/Access/Audit workflows in `src/components/AdminPanel.tsx`
- [x] T048 [US1] Add independent System, Workspace Admin, Board Admin, and Board membership controls in `src/components/AdminPanel.tsx`
- [x] T049 [US2] Add scoped board member management and eligible-user search in `src/components/AdminPanel.tsx`
- [x] T050 [US3] Show Admin entry for every effective administrator in `src/components/Header.tsx` and `src/components/Sidebar.tsx`
- [x] T051 [US3] Add loading/empty/no-results/error/success/conflict states in `src/components/AdminPanel.tsx`
- [x] T052 [US3] Validate keyboard labels, focus, selected chips, workspace-qualified boards, and 375/768/1280 layout in component tests

## Phase 8 — End-to-end and compatibility

- [x] T053 [US1] Add System Admin mixed-access Create/Edit journey in `tests/e2e/layered-access.spec.ts`
- [x] T054 [US2] Add non-member Workspace Admin membership journey and denials in `tests/e2e/layered-access.spec.ts`
- [x] T055 [US2] Add non-member Board Admin membership journey and out-of-scope denials in `tests/e2e/layered-access.spec.ts`
- [x] T056 [US3] Add bounded directory/resource search coverage in `server/tests/admin-access-routes.test.ts`, cross-page selection coverage in `src/components/AdminAssignmentPicker.test.tsx`, and searched selections in `tests/e2e/layered-access.spec.ts`
- [x] T057 [US4] Add legacy database contract and SQLite integrity assertions in `server/tests/layered-access-migration.test.ts`
- [x] T058 [P] Update older fixtures/tests from conflated membership roles to separated grants across `server/tests/`, `src/**/*.test.tsx`, and `tests/e2e/`

## Phase 9 — Validation and canary

- [x] T059 Run focused Red/Green suites and record evidence in `tests/reports/013-layered-access-membership-validation.md`
- [x] T060 Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm run test:e2e`
- [x] T061 Run `npm run test:ci`, `npm audit --audit-level=high`, migration idempotence, and SQLite integrity checks
- [x] T062 Complete responsive light/dark visual QA at 375px, 768px, and 1280px
- [ ] T063 Commit/push exact clean source, update PR #27 and Issue #29 evidence, and wait for exact-head CI
- [ ] T064 Build/push exact immutable image and deploy only Strata canary through Gitea/ArgoCD
- [ ] T065 Live-test System/Workspace/Board/regular matrices, bounded scale, logs/events/health, and zero page errors in canary
- [ ] T066 Reset only ephemeral Strata canary data to first-account setup and mark Issue #29 awaiting feedback

## Dependencies

- T004–T011 block all authorization work.
- T012–T020 block APIs and UI.
- T021–T027 block scalable UI.
- T028–T041 block Create/Edit and scoped membership UI.
- T042–T052 block E2E.
- T053–T058 block full validation.
- T059–T066 execute sequentially on one frozen source candidate.
