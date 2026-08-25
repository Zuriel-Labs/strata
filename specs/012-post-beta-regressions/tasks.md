# Tasks: Post-Beta Consistency and Drag Reliability

**Input**: Design documents in `specs/012-post-beta-regressions/`
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`

## Phase 1: Setup and Foundations

- [x] T001 Create complete Issue-traceable specification and quality checklists in `specs/012-post-beta-regressions/`.
- [x] T002 Research current hydration, date, drag-preview, automation-scope, RBAC, test, and deployment behavior in relevant `src/`, `tests/`, and homelab files.
- [x] T003 Produce implementation plan, data model, quickstart, tasks, and clean consistency audit.
- [x] T004 Verify clean isolated branch from current `origin/main`, dependency runtime, and focused baseline tests.

## Phase 2: US1 — Workspace selection isolation (Issue #24, P1)

- [x] T005 [US1] **RED** Add reducer tests for empty-workspace hydration, mismatched defaults, valid preserved pairs, deletion fallback, and active-card reconciliation in `src/store.test.ts`.
- [x] T006 [US1] **GREEN** Add pair-wise selection reconciliation and use it in workspace/board actions and hydration in `src/store.tsx`.
- [x] T007 [US1] **REFACTOR** Extract pure navigation selection helpers and keep reducer regressions green in `src/lib/navigation-selection.ts` and tests.
- [x] T008 [US1] Add E2E coverage that waits through automatic refresh with an empty selected workspace in `tests/e2e/app.spec.ts`.

## Phase 3: US2 — Timezone-stable due dates (Issue #23, P1)

- [x] T009 [US2] **RED** Add pure tests for canonical, legacy, invalid, leap-day, month/year, and offset-bearing date values in `src/lib/date-only.test.ts`.
- [x] T010 [US2] **GREEN** Implement safe date-only normalize/format/compare helpers in `src/lib/date-only.ts`.
- [x] T011 [US2] **RED** Add modal and board-card regression tests for a selected date in `src/components/CardModal.test.tsx` and `tests/e2e/kanban-productivity.spec.ts`.
- [x] T012 [US2] **GREEN** Replace instant-based due-date rendering/edit/filter/calendar paths in `src/components/CardModal.tsx`, `src/components/BoardView.tsx`, and `src/components/SearchOverlay.tsx`.
- [x] T013 [US2] **REFACTOR** Centralize all client date-only semantics and confirm legacy/API round-trip compatibility.
- [x] T014 [US2] Add Playwright acceptance in UTC-negative, UTC, and UTC-positive browser timezones in `tests/e2e/kanban-productivity.spec.ts`.

## Phase 4: US3 — Deterministic drag gaps (Issue #25, P1)

- [x] T015 [US3] **RED** Add pure insertion-location and 100-event last-valid-retention tests in `src/lib/drag-preview.test.ts`.
- [x] T016 [US3] **GREEN** Implement normalized card/lane insertion lookup and last-valid retention in `src/lib/drag-preview.ts`.
- [x] T017 [US3] **RED** Add browser tests for exactly one explicit placeholder, preview/drop equality, cancel/failure, touch, reduced motion, and read-only behavior in `tests/e2e/kanban-productivity.spec.ts`.
- [x] T018 [US3] **GREEN** Integrate explicit placeholder and normalized insertion state into card/lane drag flows in `src/components/BoardView.tsx`.
- [x] T019 [US3] **REFACTOR** Unify card/lane preview lifecycle, committed snapshots, announcements, and persistence source while keeping all DnD tests green.
- [x] T020 [US3] Add pointer/touch boundary and refresh-order Playwright acceptance in `tests/e2e/kanban-productivity.spec.ts`.

## Phase 5: US4 — Automation workspace selector (Issue #26, P2)

- [x] T021 [US4] **RED** Add component tests for explicit workspace/board controls, scope reconciliation, and role filtering in `src/components/NavigationOverlay.test.tsx`.
- [x] T022 [US4] **GREEN** Add authorized automation workspace selection and board reconciliation in `src/components/NavigationOverlay.tsx`.
- [x] T023 [US4] **REFACTOR** Preserve existing rule form/state behavior while deriving authorized automation scope in one component.
- [x] T024 [US4] Add browser acceptance for in-panel workspace/board switching and retain existing server RBAC matrix coverage.

## Phase 5b: US5 — Bounded Admin audit reads (Issue #28, P0)

- [x] T037 [US5] **RED** Reproduce the unbounded repository result with more than 25 retained events in `server/tests/admin-routes.test.ts`.
- [x] T038 [US5] **GREEN** Apply a clamped SQL limit in `server/src/db/repositories.ts` and request 25 rows in `server/src/routes/admin-routes.ts`.
- [x] T039 [US5] **REFACTOR** Add and verify the non-destructive newest-first audit index in `server/src/db/schema.ts`.
- [ ] T040 [US5] Verify canary Admin loading, response count, memory, health, events, and preserved audit row count.

## Phase 6: Cross-Cutting Validation

- [x] T025 Run focused Red/Green suites after each story and record expected failures before implementation.
- [ ] T026 Audit keyboard/focus labels, touch targets, live feedback, reduced motion, dark/light themes, and 375/768/1280 layouts.
- [x] T027 Run server/RBAC/contract regression suites and confirm no endpoint/response expansion and only the planned additive index.
- [x] T028 Run SQLite integrity, dependency audits, typecheck, lint, unit/integration, build, E2E, and full `npm run test:ci`.
- [x] T029 Create an exact truthful report in `tests/reports/012-post-beta-regressions-*.md` and update all artifact/checklist/task status.

## Phase 7: GitHub and Canary Delivery

- [ ] T030 Re-fetch `origin/main`, verify clean diff and merge base, commit conventionally, push branch, and open a PR closing #23–#26 and #28.
- [ ] T031 Wait for exact-head GitHub CI and publish source/test/rollback evidence to the PR and Issues.
- [ ] T032 Capture Strata canary, production, nodes, apps, pods, Ceph, logs/events, and exact rollback baseline.
- [ ] T033 Build and push one immutable image from the clean exact source commit and record digest/revision label.
- [ ] T034 Change only `apps/strata-canary/values.yaml`, validate/render, commit only that path, and push to Gitea.
- [ ] T035 Verify ArgoCD Synced/Healthy, 1/1 rollout, running digest, health/TLS, auth, logs/events, and all five live journeys.
- [ ] T036 Replace working labels with canary/feedback labels, leave Issues open, verify production unchanged, and hand off one checklist.

## Dependencies

```text
T001–T004
  ├─ US1 T005–T008
  ├─ US2 T009–T014
  ├─ US3 T015–T020
  ├─ US4 T021–T024
  └─ US5 T037–T040
All stories, including T037–T040 → T025–T029 → T030–T036
```
