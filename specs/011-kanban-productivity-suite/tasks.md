---
description: "Dependency-ordered Red/Green/Refactor execution ledger for Strata Issues #15–#19"
---

# Tasks: Kanban Productivity Suite

**Input**: Design documents from `/specs/011-kanban-productivity-suite/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, and all completed checklists

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable because it touches independent files and has no unfinished dependency.
- **[Story]**: Maps the task to an independently testable user story.
- **RED / GREEN / REFACTOR**: The required TDD state; do not implement a GREEN task until its paired RED task has failed for the intended reason.
- A task is checked only after its command/evidence is recorded in the validation report.

## Phase 1: Setup

- [x] T001 Confirm branch, merge base, clean ownership boundaries, live Issues #15–#19, and unchanged production/canary baselines; record SHAs and images in `tests/reports/011-kanban-productivity-suite-<timestamp>.md`.
- [x] T002 Add the pinned dnd-kit and Tiptap dependencies to `package.json` and `package-lock.json`; run an install audit and verify React 19 peer compatibility.
- [x] T003 [P] Add shared rich-text type declarations and constants in `src/types.ts` and `src/lib/rich-text.ts` without changing runtime behavior.
- [x] T004 [P] Add shared card-order helper types in `src/lib/card-order.ts` without changing runtime behavior.

## Phase 2: Foundational Rich-Text and Ordering Safety

- [x] T005 [US2] **RED** Add schema/migration tests for new, legacy, repeated-start, and malformed rich-text rows in `server/tests/foundation.test.ts`.
- [x] T006 [US2] **RED** Add validation/projection tests for allowed nodes/marks, multiline conversion, invalid protocols, oversized/deep documents, mutually exclusive legacy/structured inputs, and plain-text extraction in `src/lib/rich-text.test.ts`.
- [x] T007 [US2] **GREEN** Add idempotent `cards.description_json` startup migration in `server/src/db/schema.ts`.
- [x] T008 [US2] **GREEN** Implement strict rich-document validation, legacy conversion, safe-link validation, and plain-text projection in `src/lib/rich-text.ts`.
- [x] T009 [US2] **GREEN** Map `descriptionDocument` on every card read and synchronize JSON/plain fields on update in `server/src/db/repositories.ts` and `server/src/routes/card-routes.ts`.
- [x] T010 [US2] **REFACTOR** Centralize card row mapping and rich-description persistence; rerun T005–T009 focused tests plus current CRUD regressions.
- [x] T011 [US1] **RED** Add repository/route tests for same-list exact moves, cross-list moves, compact positions, original-position no-op, invalid/missing/archived/cross-board destinations, injected failure rollback, audit, RBAC, and one automation execution in `server/tests/crud-routes.test.ts` and `server/tests/rbac-routes.test.ts`.
- [x] T012 [US1] **GREEN** Implement transactional validated card movement and audit metadata in `server/src/db/repositories.ts` and `server/src/routes/card-routes.ts`.
- [x] T013 [US1] **REFACTOR** Extract compact-order helpers/prepared statements, remove route-level mutation loops, and rerun T011 plus automation regressions.

## Phase 3: User Story 1 — Modern card reordering (Issue #15, P1)

**Independent acceptance**: Exact same/cross-list order survives reload for pointer and keyboard paths; cards animate around a visible gap; cancellation/failure/filtering/RBAC preserve every card.

- [x] T014 [US1] **RED** Add pure tests for mapping a visible filtered insertion target into the complete active-card sequence in `src/lib/card-order.test.ts`.
- [x] T015 [US1] **GREEN** Implement deterministic visible-to-complete insertion mapping in `src/lib/card-order.ts`.
- [x] T016 [US1] **RED** Add component tests for delayed pointer activation, drag overlay/gap state, same-list and cross-list hover order, Escape cancellation, keyboard operation, click-to-open preservation, read-only behavior, and failed-save rollback/toast in `src/components/BoardView.test.tsx`.
- [x] T017 [US1] **GREEN** Replace card native drag handlers with dnd-kit sortable cards/containers in `src/components/BoardView.tsx`, including optimistic snapshots, overlay, animation, focus restoration, live-region instructions, and reduced-motion behavior.
- [x] T018 [US1] **GREEN** Update `src/services/data.ts` and `src/store.tsx` so one completed drag persists once, applies the authoritative returned state, and restores/refetches after failure.
- [x] T019 [US1] **REFACTOR** Extract sortable card/list UI boundaries, eliminate stale closures and unnecessary rerenders, and keep T014–T018 tests green.
- [x] T020 [US1] Add Playwright acceptance coverage for pointer/keyboard same-list and cross-list reordering, refresh persistence, cancellation, filters, and read-only controls in `tests/e2e/kanban-productivity.spec.ts`.

## Phase 4: User Story 2 — Rich-text descriptions (Issue #19, P1)

**Independent acceptance**: Every approved format and legacy line boundary round-trips through edit/view/reload, while cancellation, failure, RBAC, and unsafe content are handled safely.

- [x] T021 [US2] **RED** Add renderer tests for every supported node/mark, safe external links, empty/legacy documents, malformed fallback, and no HTML execution in `src/components/RichTextRenderer.test.tsx`.
- [x] T022 [US2] **GREEN** Implement semantic React rendering without `dangerouslySetInnerHTML` in `src/components/RichTextRenderer.tsx`.
- [x] T023 [US2] **RED** Add editor tests for toolbar names/states, keyboard shortcuts, multiline initialization, undo/redo, safe paste/link normalization, Save/Cancel, focus, read-only mode, and recoverable failed draft in `src/components/RichTextEditor.test.tsx` and `src/components/CardModal.test.tsx`.
- [x] T024 [US2] **GREEN** Implement the constrained Tiptap editor and accessible formatting toolbar in `src/components/RichTextEditor.tsx`.
- [x] T025 [US2] **GREEN** Integrate rich read/edit modes and pending/error draft semantics in `src/components/CardModal.tsx`, `src/services/data.ts`, and `src/store.tsx`.
- [x] T026 [US2] **REFACTOR** Separate editor commands, renderer concerns, and modal persistence state; keep T021–T025 and legacy modal tests green.
- [x] T027 [US2] Add contract and Playwright tests for JSON limits, unsafe payloads, legacy multiline migration, full formatting round-trip, reload/session restoration, mobile viewport, and read-only access in `tests/contract/kanban-productivity.contract.test.ts` and `tests/e2e/kanban-productivity.spec.ts`.

## Phase 5: User Story 3 — Manage labels inside a card (Issue #18, P1)

**Independent acceptance**: An authorized user can create-and-assign, rename, recolor, confirm-delete, Save/Cancel, and observe board-wide consistency without closing the card; role/failure paths remain correct.

- [x] T028 [US3] **RED** Extend label repository/route tests for trimmed/empty names, color-only labels, invalid colors, duplicate IDs, atomic dependent cleanup, audit metadata, label-management RBAC, and injected failure in `server/tests/crud-routes.test.ts` and `server/tests/rbac-routes.test.ts`.
- [x] T029 [US3] **GREEN** Harden `PUT /api/boards/{boardId}/labels` validation and transactional cleanup in `server/src/routes/board-routes.ts` and `server/src/db/repositories.ts` without changing its aggregate contract.
- [x] T030 [US3] **RED** Add reusable editor tests for create/edit/color/delete confirmation, impact copy, Save/Cancel, pending lockout, failure recovery, focus, and permission-specific controls in `src/components/LabelEditor.test.tsx`.
- [x] T031 [US3] **GREEN** Extract reusable staged label-management UI from `src/components/BoardLabelsDialog.tsx` into `src/components/LabelEditor.tsx` and preserve board-manager behavior.
- [x] T032 [US3] **RED** Add card-modal tests for managing definitions in context, automatic assignment after successful create, immediate shared-definition refresh, deleted-assignment cleanup, and assignment-only roles in `src/components/CardModal.test.tsx`.
- [x] T033 [US3] **GREEN** Integrate `LabelEditor` into `src/components/CardModal.tsx` with explicit permission props, authoritative state reconciliation, and create-then-assign behavior in `src/store.tsx`.
- [x] T034 [US3] **REFACTOR** Deduplicate board/card label flows and keep T028–T033 plus `BoardLabelsDialog.test.tsx` green.
- [x] T035 [US3] Add Playwright acceptance for in-modal create-and-assign, rename/recolor, Cancel, confirmed deletion/cleanup, refresh persistence, and denied controls in `tests/e2e/kanban-productivity.spec.ts`.

## Phase 6: User Story 4 — Duplicate cards (Issue #17, P2)

**Independent acceptance**: A fully populated card duplicates once, immediately after its source, with the exact copied/reset/regenerated contract and no partial result on failure.

- [x] T036 [US4] **RED** Add repository/route tests for field-copy semantics, fresh nested IDs, exact position, rich text, invalid source, injected transaction rollback, RBAC, audit metadata, and exactly-once `card_created` automation in `server/tests/crud-routes.test.ts`, `server/tests/automation-runner.test.ts`, and `server/tests/rbac-routes.test.ts`.
- [x] T037 [US4] **GREEN** Implement transactional deep duplication in `server/src/db/repositories.ts` and `POST /api/cards/{cardId}/duplicate` in `server/src/routes/card-routes.ts`.
- [x] T038 [US4] **REFACTOR** Extract nested identity regeneration and copy policy helpers, document each copied/reset field in code, and keep T036 green.
- [x] T039 [US4] **RED** Add modal/store tests for permission-aware duplicate action, pending lockout, success toast, opening the returned card, authoritative ordering, and failure preservation in `src/components/CardModal.test.tsx` and `src/store.test.ts`.
- [x] T040 [US4] **GREEN** Add duplicate service/store action and modal control in `src/services/data.ts`, `src/store.tsx`, and `src/components/CardModal.tsx`.
- [x] T041 [US4] **REFACTOR** Consolidate card mutation pending/error behavior and keep T039–T040 plus existing modal/store tests green.
- [x] T042 [US4] Add Playwright acceptance for a populated duplicate, independent edits, exact position, automation result, refresh persistence, and read-only absence in `tests/e2e/kanban-productivity.spec.ts`.

## Phase 7: User Story 5 — Sort swimlanes (Issue #16, P2)

**Independent acceptance**: Both deterministic orders persist for the complete active list, archive remains separated, empty/single-card lists are safe, manual drag still works, and failure/RBAC paths restore state.

- [x] T043 [US5] **RED** Add route/repository tests for `asc`/`desc`, mixed case, accents, embedded numbers, stable ties, all active/archived exclusion, empty/single no-op, transaction rollback, audit, no move automation, and RBAC in `server/tests/crud-routes.test.ts` and `server/tests/rbac-routes.test.ts`.
- [x] T044 [US5] **GREEN** Implement fixed-collator transactional list sorting and `POST /api/lists/{listId}/sort` in `server/src/db/repositories.ts` and `server/src/routes/list-routes.ts`.
- [x] T045 [US5] **REFACTOR** Reuse compact-order persistence from card movement where safe and keep T043–T044 green.
- [x] T046 [US5] **RED** Add list-menu tests for both sort actions, archive separator/preservation, independent permissions, pending state, optimistic/authoritative result, failure rollback, and manual drag afterward in `src/components/BoardView.test.tsx`.
- [x] T047 [US5] **GREEN** Add sort service/store behavior and accessible list-menu actions in `src/services/data.ts`, `src/store.tsx`, and `src/components/BoardView.tsx`.
- [x] T048 [US5] **REFACTOR** Consolidate list menu mutation handling and keep T046–T047 plus archive/list-drag regressions green.
- [x] T049 [US5] Add Playwright acceptance for both sort directions, refresh, active filters, empty/single list, archive action, manual drag after sort, and permission gating in `tests/e2e/kanban-productivity.spec.ts`.

## Phase 8: Cross-cutting Regression, Accessibility, and Security

- [x] T050 [P] Add/complete OpenAPI contract assertions for every new/changed endpoint, stable `{ message }` failures, auth, content types, and unknown-field rejection in `tests/contract/kanban-productivity.contract.test.ts`.
- [x] T051 [P] Audit keyboard order, focus restoration, live regions, control names, touch target size, dark/light themes, reduced motion, mobile overflow, and screen-reader semantics across `BoardView`, `CardModal`, `RichTextEditor`, and `LabelEditor`; add focused regressions.
- [x] T052 [P] Add hostile rich-text/link payloads, cross-board IDs, stale orders, direct unauthorized calls, duplicate submissions, and forced transaction failures to server/security tests.
- [x] T053 Run focused client/server/contract suites, then `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e`, and `npm run test:ci`; resolve every regression without weakening tests.
- [x] T054 Inspect dependency audit output, production bundle impact, console/page errors, unhandled requests, database integrity, and migration restart behavior; record evidence in the validation report.
- [x] T055 Update `spec.md` to Implemented, check every satisfied task, requirements checklist, and Issue acceptance item, and complete the report in `tests/reports/` with exact commands/results.

## Phase 9: GitHub and Canary Delivery

- [ ] T056 Re-fetch `origin/main`, verify merge-base/clean diff/no unrelated files, commit the complete source candidate conventionally, push `feat/kanban-productivity-suite`, and open one unmerged PR linked to #15–#19.
- [ ] T057 Capture a read-only homelab pre-change baseline: nodes, ArgoCD app health/sync, Strata canary deployment/pods/image/logs/events, Ceph health, and the exact previous canary image.
- [ ] T058 Build the immutable OCI image from the exact clean source commit, push it to the approved registry, and verify/record its digest and source label.
- [ ] T059 Change only `/Users/chris/Documents/Github/homelab/apps/strata-canary/values.yaml`, commit only that path, push to Gitea, and record the homelab commit; do not touch production.
- [ ] T060 Wait for ArgoCD Synced/Healthy and rollout completion; verify running image digest, probes, routes, TLS, logs, warning events, resources, and no collateral homelab changes.
- [ ] T061 Create a dedicated canary-only login without exposing credentials and execute every local acceptance scenario in the deployed browser at `https://strata-canary.eaglepass.io`.
- [ ] T062 Publish the exact candidate tuple and evidence to the PR and all five Issues; replace `agent:working` with `agent:canary` and `agent:awaiting-feedback`; leave Issues open for human validation.
- [ ] T063 Verify production image/config/workloads remain exactly at the pre-session baseline and hand off the unified canary candidate for explicit approval.

## Dependencies

```text
Setup T001–T004
  ├─ Rich-text foundation T005–T010 ──> US2 T021–T027
  └─ Ordering foundation T011–T013 ──> US1 T014–T020 ──> US5 T043–T049

Board-label aggregate (existing) ──> US3 T028–T035
Card row mapping + ordering foundation ──> US4 T036–T042

All five stories ──> T050–T055 ──> T056–T063
```

- US3 can begin after Setup because it reuses the existing board-label aggregate.
- US4 requires rich-card mapping and compact-order transactions.
- US5 requires the compact-order foundation but remains independently testable.
- Canary deployment requires a fully committed, green, pushed source tree and an open unmerged PR.
- Production deployment and source merge are not tasks in this candidate; they require explicit later approval.
