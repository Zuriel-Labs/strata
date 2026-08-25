# Tasks: Board Member Card Collaboration

**Input**: Design documents from `/specs/030-board-member-permissions/`
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`

## Phase 1: Setup and Traceability

- [x] T001 Create and claim GitHub Issue #30 with complete role matrix, boundaries, and acceptance criteria.
- [x] T002 Create and audit feature specification, security/UX checklists, research, data model, contract, plan, and quickstart under `specs/030-board-member-permissions/`.

## Phase 2: Foundational Authorization

- [x] T003 [US1] Write focused failing server and client permission tests for exact Member, Observer, administrator, and out-of-scope behavior in `server/tests/permissions.test.ts` and `src/lib/auth-context.test.ts`.
- [x] T004 [US1] Implement exact Member card-edit capability in `server/src/rbac/permissions.ts` and `src/lib/auth-context.tsx`.
- [x] T005 [US1] Write focused failing route tests for Member card create/move/edit/duplicate, Member list denial, archive/delete denial, and eligible assignees in `server/tests/board-member-collaboration.test.ts`.
- [x] T006 [US1] Apply card versus list authorization and Member-only assignee validation in `server/src/routes/card-routes.ts`, `server/src/routes/list-routes.ts`, and `server/src/db/repositories.ts`.

## Phase 3: Member Card UI

- [x] T007 [US1] Write failing component tests for Member card controls with administrative list actions absent in `src/components/BoardView.test.tsx` and `src/components/CardModal.test.tsx`.
- [x] T008 [US1] Separate card collaboration from list administration and gate Card modal mutations in `src/components/BoardView.tsx` and `src/components/CardModal.tsx`.
- [x] T009 [US1] Refactor permission naming and role-aware user filtering with focused and regression tests green.

## Phase 4: Ownership-Safe Comments

- [x] T010 [US2] Write failing integration tests for server-derived author, own edit, cross-author denial, Member delete denial, administrator delete, missing/empty input, audit, and generic bypass in `server/tests/board-member-collaboration.test.ts`.
- [x] T011 [US2] Implement strict comment routes and atomic repository updates in `server/src/routes/card-routes.ts` and `server/src/db/repositories.ts`; remove generic comment/activity writes.
- [x] T012 [US2] Write failing Card modal tests for add, edit-own, hide cross-author edit, admin delete, pending/error recovery, and Observer read-only behavior in `src/components/CardModal.test.tsx`.
- [x] T013 [US2] Add comment services, store authoritative Card responses, and accessible comment edit/delete UI in `src/services/data.ts` and `src/components/CardModal.tsx`.

## Phase 5: Existing Automation Editing

- [x] T014 [US4] Write failing form-mapping and Management panel tests for prefill, save, cancel, invalid input, failure preservation, and scoped visibility in `src/components/automation-rule-form.test.ts` and `src/components/NavigationOverlay.test.tsx`.
- [x] T015 [US4] Implement existing-rule form mapping and full edit mode in `src/components/automation-rule-form.ts` and `src/components/NavigationOverlay.tsx`.
- [x] T016 [US4] Extend server route tests proving Board Admin, Workspace Admin, and System Admin edits succeed in scope while out-of-scope edits fail and audit persists in `server/tests/board-member-collaboration.test.ts`.

## Phase 6: Contracts and Browser Coverage

- [x] T017 [P] [US1] Align API contract tests with Member card operations, comment routes, and generic-update rejection in `tests/contract/`.
- [x] T018 [US1] Add Playwright coverage for Member card collaboration without swimlane administration in `tests/e2e/board-member-collaboration.spec.ts`.
- [x] T019 [US2] Add Playwright coverage for own-comment edit and administrator deletion in `tests/e2e/board-member-collaboration.spec.ts`.
- [x] T020 [US4] Add Playwright coverage for editing an existing automation in `tests/e2e/board-member-collaboration.spec.ts`.

## Phase 7: Validation, Review, and Canary

- [x] T021 Run focused tests and record Red → Green evidence for every behavior slice.
- [x] T022 Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e`, and `npm run test:ci`; remediate all scoped failures.
- [x] T023 Perform independent correctness, security, data-integrity, UX/accessibility, performance, maintainability, and test review; update artifacts to match implementation.
- [x] T024 Generate a truthful test report under `tests/reports/` and update `specs/030-board-member-permissions/tasks.md`.
- [x] T025 Commit, push, open and verify the linked PR with test, risk, rollout, and rollback evidence.
- [ ] T026 Build the clean candidate, record tag/digest/source identity, update only the Canary GitOps chart, and verify ArgoCD, workload, ingress/TLS, health, logs, and affected journeys.
- [ ] T027 Mark Issue #30 `agent:canary` and `agent:awaiting-feedback`; deliver a diff-specific user checklist and await exact-candidate approval.

## Dependencies

- T003–T006 establish the authoritative capability boundary before UI work.
- T010–T013 depend on Member card capability but are independently testable from automation editing.
- T014–T016 may proceed after foundational authorization and do not depend on comment implementation.
- T017–T020 follow stable server/client contracts.
- T021–T027 follow all implementation tasks and must preserve exact candidate identity.
