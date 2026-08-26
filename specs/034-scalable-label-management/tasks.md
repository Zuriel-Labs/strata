# Tasks: Scalable Label Management

**Issue**: [#34](https://github.com/Broville/strata/issues/34)
**Branch**: fix/scalable-label-management

## Phase 1: Specification and setup

- [x] T001 [P] Capture Issue #34 user stories, requirements, edge cases, non-goals, and measurable outcomes in specs/034-scalable-label-management/spec.md.
- [x] T002 [P] Complete requirement, UX, API, and security quality gates in specs/034-scalable-label-management/checklists/.
- [x] T003 [P] Record technical decisions, alternatives, and no-new-dependency rationale in specs/034-scalable-label-management/research.md.
- [x] T004 [P] Define persistence entities, invariants, and state transitions in specs/034-scalable-label-management/data-model.md.
- [x] T005 [P] Define session, System Settings, label replacement, limit, and conflict contracts in specs/034-scalable-label-management/contracts/scalable-label-management.openapi.yaml.
- [x] T006 [P] Document focused development and Canary validation in specs/034-scalable-label-management/quickstart.md.
- [x] T007 Install locked dependencies in the isolated worktree and prove the pre-change targeted label suites execute.

## Phase 2: Foundational persistence and shared contracts

- [x] T008 **RED** Add idempotent fresh/repeated/legacy migration tests for platform_settings and boards.labels_revision in server/tests/foundation.test.ts.
- [x] T009 **GREEN** Add the typed singleton policy row, labels revision migration, and safe default repair in server/src/db/schema.ts.
- [x] T010 **RED** Add repository tests for reading/updating the policy, counting over-limit Boards, Board mapping revisions, and non-destructive duplicate-ID inventory in server/tests/foundation.test.ts and server/tests/crud-routes.test.ts.
- [x] T011 **GREEN** Add typed policy/revision repository helpers and Board mapping in server/src/db/repositories.ts and server/src/types.ts.
- [x] T012 **RED** Extend client/server shared type and hydration tests for maxLabelsPerBoard and labelsRevision in src/store.test.ts, src/App.auth.test.tsx, and server/tests/auth-routes.test.ts.
- [x] T013 **GREEN** Extend Board, AppState, session payload, seed fixtures, hydration, and reducer contracts in src/types.ts, src/data.ts, src/store.tsx, and server/src/db/repositories.ts.

## Phase 3: User Story 1 — Independent stable labels (P1)

- [x] T014 [US1] **RED** Add a LabelEditor regression with persisted id_101 proving fresh sixth-label typing/color collision before the fix in src/components/LabelEditor.test.tsx.
- [x] T015 [US1] **GREEN** Generate collision-resistant definition IDs and isolate row/color/delete state by stable identity in src/components/LabelEditor.tsx and a focused src/lib helper if needed.
- [x] T016 [US1] **RED** Add duplicate-ID atomic rejection and safe actionable error tests in server/tests/crud-routes.test.ts and tests/contract/scalable-label-management.contract.test.ts.
- [x] T017 [US1] **GREEN** Preserve strict unique-ID validation and return machine-actionable safe definition errors in server/src/routes/board-routes.ts.

## Phase 4: User Story 2 — Default and configured label limits (P1)

- [x] T018 [US2] **RED** Add API tests for default 12, accepted 12, rejected 13th, custom/new-Board enforcement, and unchanged dependent data in server/tests/crud-routes.test.ts.
- [x] T019 [US2] **GREEN** Enforce the effective additive limit for Board creation and label replacement in server/src/routes/board-routes.ts and server/src/db/repositories.ts.
- [x] T020 [US2] **RED** Add over-limit tests proving rename/recolor/delete succeed while new identities fail in server/tests/crud-routes.test.ts.
- [x] T021 [US2] **GREEN** Implement identity-aware additive versus non-additive policy evaluation in server/src/routes/board-routes.ts.
- [x] T022 [US2] **RED** Add shared editor tests at 6, 12, configured-above-12, and limit-plus-one for count copy, Add state, existing controls, deterministic palette reuse, scrolling semantics, and failure recovery in src/components/LabelEditor.test.tsx and src/components/BoardLabelsDialog.test.tsx.
- [x] T023 [US2] **GREEN** Make LabelEditor limit-aware with bounded row scrolling, accessible feedback, independent controls, and deterministic palette cycling in src/components/LabelEditor.tsx and src/components/BoardLabelsDialog.tsx.
- [x] T024 [US2] **RED** Add card/Board entry-point parity and authoritative propagation tests in src/components/CardModal.test.tsx, src/App.rbac.test.tsx, and src/store.test.ts.
- [x] T025 [US2] **GREEN** Pass effective limits/revisions through Header, CardModal, label services, and reducer updates in src/components/Header.tsx, src/components/CardModal.tsx, src/services/data.ts, and src/store.tsx.

## Phase 5: User Story 3 — System Administrator policy (P2)

- [x] T026 [US3] **RED** Add API tests for System Admin success, 1/100 bounds, malformed values, persisted restart behavior, over-limit Board counts, safe audit metadata, and denied roles in server/tests/admin-routes.test.ts and server/tests/rbac-routes.test.ts.
- [x] T027 [US3] **GREEN** Add strict System Admin-only label-policy mutation, persistence, Board impact count, and audit handling in server/src/routes/admin-routes.ts, server/src/db/repositories.ts, and server/src/rbac/policies.ts.
- [x] T028 [US3] **RED** Add Admin Panel tests for System Settings visibility, current value, bounds, impact warning, pending/success/error states, and scoped-role denial in src/App.admin.test.tsx.
- [x] T029 [US3] **GREEN** Add System Settings tab and service mutation with authenticated refresh in src/components/AdminPanel.tsx, src/services/admin.ts, and src/types.ts.

## Phase 6: User Story 4 — Concurrent management (P2)

- [x] T030 [US4] **RED** Add two-editor API tests proving stale replacement cannot overwrite accepted labels, references, revision, or audit state in server/tests/crud-routes.test.ts.
- [x] T031 [US4] **GREEN** Add required expectedRevision, conditional revision increment, atomic conflict response, cleanup, and audit in server/src/routes/board-routes.ts and server/src/db/repositories.ts.
- [x] T032 [US4] **RED** Add service/editor tests for safe conflict details, preserved draft, blocked blind retry, and explicit authoritative reload/review in src/services/api.test.ts and src/components/LabelEditor.test.tsx.
- [x] T033 [US4] **GREEN** Carry safe error code/details through src/services/api.ts and implement shared conflict recovery in src/components/LabelEditor.tsx, src/components/CardModal.tsx, and src/components/Header.tsx.

## Phase 7: Contracts, RBAC, and cross-feature regression

- [x] T034 [P] Update existing kanban contract references and add focused executable contract assertions in specs/011-kanban-productivity-suite/contracts/kanban-productivity.openapi.yaml and tests/contract/scalable-label-management.contract.test.ts.
- [x] T035 [P] Extend role-matrix coverage for System, Workspace, Board, Member, Observer, out-of-scope, and unauthenticated actors in server/tests/rbac-routes.test.ts and server/tests/rbac-matrix.test.ts.
- [x] T036 [P] Verify deletion cleanup, card assignment, filters, and automation selectors remain complete with 12/above-12 definitions in src/store.test.ts, src/components/CardModal.test.tsx, and server/tests/crud-routes.test.ts.
- [x] T037 Add Playwright acceptance for fresh-load sixth-label identity, default 12/13th blocked, policy update, grandfathered lower limit, responsive touch-sized controls, and persistence in tests/e2e/scalable-label-management.spec.ts.

## Phase 8: Validation, review, and documentation

- [x] T038 Run focused client, server, contract, and Playwright suites after each slice and record exact Red/Green evidence.
- [x] T039 Run npm run typecheck, npm run lint, npm run test, npm run build, npm run test:e2e, npm run test:ci, npm audit, and git diff --check.
- [x] T040 Perform an independent correctness/security/data-integrity/UX/performance/maintainability/test review and remediate every critical, high, and medium finding.
- [x] T041 Validate fresh and legacy database migration, quick_check/integrity, preserved label JSON, and policy persistence across reopen.
- [x] T042 Perform local browser visual/interaction checks at desktop, tablet, and phone widths with keyboard, pointer, and touch-sized controls.
- [x] T043 Write the truthful validation report under tests/reports/ and update this task ledger to match actual evidence.

## Phase 9: Reviewed PR and Canary delivery

- [ ] T044 Commit focused Conventional Commits, push fix/scalable-label-management, and open a linked PR with risks, validation, rollout, and rollback evidence.
- [ ] T045 Obtain/reconcile independent PR review and exact-head GitHub CI; remediate and rerun affected gates without merging.
- [ ] T046 Build and push one immutable OCI image from the exact clean reviewed source commit and record its digest.
- [ ] T047 Update only the Strata Canary Homelab chart through Gitea, wait for ArgoCD, and verify exact image, migration, health, readiness, logs/events, TLS, and database integrity.
- [ ] T048 Exercise the live Canary Issue #34 journeys, prove production unchanged, replace agent:working with agent:canary and agent:awaiting-feedback, and publish a diff-specific test checklist.

## Dependency order

- T007 precedes all executable Red tests.
- T008–T013 establish storage and shared contracts before label, policy, or concurrency stories.
- T014–T017 fix identity before scale-boundary UX.
- T018–T025 deliver the default limit before System Admin configurability.
- T026–T029 deliver policy administration before concurrency/live policy tests.
- T030–T033 complete stale-write safety before cross-feature/E2E coverage.
- T034–T037 precede full validation.
- T038–T043 precede any commit/image/deployment.
- T044–T048 are the reviewed reproducible Canary pipeline; production is excluded.
