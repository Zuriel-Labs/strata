# Validation Report: Kanban Productivity Suite

> The first-candidate evidence below is retained as history. Its keyboard-handle, reset-watcher, and five-Issue conclusions were superseded by the first canary acceptance remediation recorded at the end of this report.

**Started (UTC)**: 2026-08-25T03:17:53Z
**Worktree**: `/Users/chris/Documents/Github/strata-kanban-productivity`
**Branch**: `feat/kanban-productivity-suite`

## Source baseline

- Local starting SHA: `bfa003122589e9b290ca32c0816a66549b71aa0c`
- Fresh `origin/main`: `bfa003122589e9b290ca32c0816a66549b71aa0c`
- Merge base: `bfa003122589e9b290ca32c0816a66549b71aa0c`
- Runtime used: Node `v22.23.2`, npm `10.9.8`
- Primary checkout and abandoned `/Users/chris/Documents/Github/strata-card-reordering` worktree are excluded and untouched.

## Issue baseline

Open Issues are exactly #15–#19. Each has `agent:working` and the session claim label `claimed_at:1787626856`; prior-agent claim labels are absent.

## Deployment baseline

- Canary configured image: `10.0.20.11:32309/strata:canary-20260527`
- Production configured image: `10.0.20.11:32309/strata:prod-20260520-2136`
- Canary data: `emptyDir`, `SEED_DATA=true`, namespace `strata-canary`
- Production data: NFS `/mnt/user/strata`, `SEED_DATA=false`
- Production mutation authorization: **not granted**; production must remain unchanged.
- Live cluster workload/ArgoCD/Ceph baseline: pending secure kubeconfig acquisition before T057.

## Specification gates

- OpenAPI YAML syntax: PASS
- Requirements: 62
- Acceptance scenarios: 35
- Tasks: 63 contiguous IDs
- Unchecked specification quality items: 0
- Critical/high consistency findings: 0
- Remediated medium findings: 3
- `git diff --check`: PASS

## TDD evidence

Focused RED/GREEN/REFACTOR and full command results will be appended as implementation proceeds.

### T002 — dependency setup

- Installed exact: `@dnd-kit/react@0.5.0`, `@dnd-kit/helpers@0.5.0`, `@tiptap/react@3.30.3`, `@tiptap/pm@3.30.3`, `@tiptap/starter-kit@3.30.3`, `@tiptap/extension-link@3.30.3`.
- `npm ls ... --depth=0`: PASS; React/React DOM 19 satisfy declared peers.
- `npm audit --omit=dev`: 2 transitive findings (1 low, 1 moderate), 0 high, 0 critical. No forced/breaking mutation applied.
- npm replaced the repository's broken tracked `/home/echo/strata/node_modules` symlink with a local ignored dependency directory. Restore that tracked symlink before committing; never commit dependency contents or the apparent deletion.

### T005–T010 — rich-text foundation

- RED: `npx vitest run src/lib/rich-text.test.ts server/tests/foundation.test.ts` produced 13 intended failures: missing helpers/column, legacy conversion, validation, and fallback.
- GREEN: the same command passes 14/14 tests.
- Typecheck: PASS after adding the required shared card document field to all constructors/mappers.
- CRUD regression: 47/49 initially exposed an internal dual-input bug; the two focused persistence tests pass after the route was refactored to pass only the canonical structured document to the repository.
- Migration is additive/idempotent; malformed stored JSON safely falls back to legacy text; submitted invalid JSON is rejected.

### T011–T013 — transactional card ordering foundation

- RED: 3/6 new ordering tests failed for missing relational validation, stable error handling, and audit evidence; existing happy-path moves demonstrated the pre-existing non-transactional behavior.
- GREEN/REFACTOR: 6/6 ordering tests pass, including injected SQLite-trigger rollback, compact same/cross-list positions, archived/missing/cross-board rejection, audit metadata, and RBAC denial.
- Existing move and `card_moved` automation regressions: 2/2 pass.
- Typecheck: PASS.

### T014–T019 — modern card reordering client

- RED: 4/4 filtered-order mapping tests failed before helper implementation; the new accessibility component test failed because no keyboard drag handle existed.
- GREEN/REFACTOR: 4/4 position-mapping tests, 8/8 BoardView tests, 8/8 store tests, and 6/6 transactional server tests pass.
- Verified in component tests: named keyboard handles, no native-draggable cards, read-only control removal, one keyboard persistence call, Escape cancellation with zero calls, failed-request snapshot restoration, and authoritative server-card application.
- dnd-kit provides sortable transforms/gap animation, touch/pointer/keyboard sensors, and a lifted overlay; the source card retains a low-opacity gap while dragging.
- Typecheck and lint: PASS.

### T021–T027 — rich-text descriptions

- RED/GREEN/REFACTOR component and parser suites: 14 rich-text parser/foundation tests, 2 semantic renderer tests, 2 Tiptap editor tests, and the 20-test card-modal suite pass.
- Structured documents support paragraphs, hard breaks, headings 2–3, bold, italic, strike, inline code, links, lists, quotes, code blocks, rules, undo, and redo.
- View mode renders semantic React nodes without `dangerouslySetInnerHTML`; unsafe protocols, oversized/deep documents, unknown shapes, and dual legacy/structured submissions return stable 400 responses.
- Legacy multiline text migrates idempotently to `description_json`; malformed stored JSON falls back safely to the legacy plain projection.
- Playwright verifies toolbar availability, multiline/bold round-trip, reload persistence, mobile viewport operation, and read-only editor gating.

### T028–T035 — in-card board-label management

- Transaction tests cover trimmed/color-only labels, strict hex colors, unique IDs, unknown fields, dependent card/automation cleanup, audit metadata, RBAC, and injected rollback.
- Reusable `LabelEditor` tests cover staged create/rename/recolor, Save/Cancel, delete impact confirmation, pending lockout, and failure recovery.
- Playwright verifies create-and-assign, Cancel restoration, rename, recolor, confirmed board-wide deletion from two cards, refresh persistence, and absence of management controls for a read-only member.

### T036–T042 — transactional card duplication

- 4 server integration tests verify the copied/reset/regenerated field contract, exact source-adjacent position, rich documents, independent checklist/item/attachment IDs, one `card_created` automation run, audit metadata, rollback, missing source, and RBAC.
- Store/modal tests verify pending lockout, one request, error preservation, authoritative insertion, and opening the returned duplicate.
- Playwright duplicates a populated card, verifies copied rich text/member/due/checklist/attachment/label data and automation output, confirms reset watch state, edits the copy independently, confirms exact position, reloads, and verifies read-only absence.

### T043–T049 — deterministic list sorting

- RED: 5 route/repository scenarios returned 404 before the endpoint existed.
- GREEN/REFACTOR: 15 combined ordering/duplication/sort server tests and 3 pure collator tests pass.
- Fixed `en-US` case/accent-insensitive numeric collation preserves stable ties, compacts every active position transactionally, excludes archived cards, avoids `card_moved` automation, audits non-trivial sorts, and treats empty/single lists as side-effect-free no-ops.
- 12 BoardView and 11 store tests verify accessible menu labels, independent sort/archive permissions, separator, optimistic and authoritative orders, pending lockout, exact rollback, and continued manual drag.
- Playwright verifies filtered full-list sorting, both directions, reload persistence, empty/single safety, Archive List preservation, reduced motion, keyboard reorder after sort, and pointer cross-lane persistence.

### T050–T055 — cross-cutting validation

- New OpenAPI/HTTP contract suite: 5/5 PASS, including auth, JSON content types, strict unknown-field rejection, stable message envelopes, unsafe rich input, cross-board label IDs, and authoritative response bodies.
- Accessibility remediation found by browser acceptance: read-only dnd-kit cards were marked `aria-disabled` and could not be opened. Static read-only cards now remain clickable while drag controls are absent; component and Playwright regressions pass.
- Failed optimistic card moves now restore both card state and automation-generated notification state.
- `npm test`: 29 files, 225 tests PASS.
- `npm run test:e2e`: 8/8 Chromium tests PASS using 3 workers.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS. Client bundle `936.13 kB` (`279.28 kB` gzip); CSS `75.09 kB` (`14.32 kB` gzip); server bundle `134.7 kB`. Existing large-chunk warning remains non-blocking.
- `npm audit`: 0 vulnerabilities after non-forced updates to Vite/build tooling (`esbuild@0.28.2`, `tsx@4.23.12`); `npm audit --omit=dev`: 0 vulnerabilities.
- SQLite E2E database `PRAGMA integrity_check`: `ok`.
- Foundation restart/migration coverage: PASS on new, legacy, repeated-start, and malformed rows.
- `git diff --check`: PASS.
- Final `npm run test:ci`: PASS after the documentation freeze — lint, 29 Vitest files / 225 tests, production client/server build, and 8 Playwright tests using 3 workers all passed in one command.
- Full-suite timing hardening: raised only Vitest's infrastructure timeout from 5s to 10s after a loaded parallel run produced a one-off timeout in an unchanged CRUD test; all assertions remain unchanged and the affected test completed in 406ms on the clean CI run.

## Local acceptance conclusion

All 62 first-candidate functional requirements and 35 Given/When/Then scenarios had implementation evidence across pure, component, route, contract, and real-browser layers. That candidate was invalidated by canary acceptance feedback. Source remained based on `origin/main` `bfa003122589e9b290ca32c0816a66549b71aa0c`; production remained unauthorized and unchanged.

## First Canary Acceptance Remediation — replacement candidate

### Scope and RED/GREEN evidence

- Reopened #15–#19 and created researched regression Issues #21 and #22; the suite now has 75 functional requirements, 51 Given/When/Then scenarios, and 81 contiguous tasks.
- Whole-card interaction: removed the dedicated handle and keyboard sensor, retained dnd-kit gap/overlay animation, added click-after-release and post-drag open suppression, and covered same-list, cross-list, read-only, mouse, and real Chromium touch input.
- Label stability: reproduced the five-second auth-refresh reset and removed passive prop-to-draft replacement; unit rerender and 5.5-second browser hold tests pass.
- Duplication: watching now persists only when the duplicating actor is both a source member and watching; copied checklists retain independent IDs and mutation isolation.
- Description: editor and renderer use one rich-content style contract; read-mode links remain direct links, Undo/Redo controls are absent, and responsive dark-mode visual comparison matches view/edit structure.
- Checklists: restored progress, create, add, toggle, un-toggle, and delete-item controls; updates remain authoritative on failures; strict nested server validation, completion automation, read-only view, refresh, and duplicate independence pass.
- Archive: archived parent lists project once, child cards no longer appear as phantom rows, independent archived cards remain visible, and System/Workspace/Board administrators can confirm permanent archived-list deletion with atomic cascade and audit evidence.

### Exact local validation

- Fresh `origin/main`: `bfa003122589e9b290ca32c0816a66549b71aa0c`; merge base unchanged.
- `npm audit --audit-level=high`: PASS, 0 vulnerabilities.
- `npm audit --omit=dev --audit-level=high`: PASS, 0 vulnerabilities.
- `sqlite3 server/data/e2e.sqlite 'PRAGMA integrity_check;'`: `ok`.
- `npx vitest run server/tests/foundation.test.ts`: 4/4 PASS for additive/idempotent migration and malformed legacy fallback.
- Focused component/contract validation: 7 files, 63/63 PASS.
- Focused route/repository/RBAC validation: 3 files, 88/88 PASS.
- `npm run test:ci`: PASS on the complete replacement tree: lint; 30 Vitest files / 233 tests; typecheck; client/server build; 10/10 Chromium E2E tests.
- Build output: client JS `944.90 kB` (`280.90 kB` gzip), CSS `76.61 kB` (`14.64 kB` gzip), server `136.5 kB`; existing non-blocking large-chunk warning remains.
- In-app browser visual QA: desktop and 390×844 mobile dark-mode card modal, checklist/progress/touch targets, shared rich-text edit/view presentation, zero Undo/Redo controls, and zero console warnings/errors all PASS.
- `git diff --check`: PASS.

### Replacement local conclusion

All seven Issue stories (#15–#19, #21, #22) have local spec, unit, integration, contract, browser, touch, security, persistence, RBAC, and visual evidence. The replacement source remains based on current `origin/main`; canary deployment is authorized, while production remains unauthorized and must remain unchanged.
