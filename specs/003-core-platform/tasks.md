# Tasks: Core Platform Overhaul (003-core-platform)

## Phase 1: Setup
- [ ] T001 [P] Verify dev environment and dependencies in `package.json`
- [ ] T002 [P] Create session memory note for implementation tracking

## Phase 2: Foundation — Schema & Type Changes
- [ ] T003 [US2] Rename `email` → `username` in `server/src/db/schema.ts` (column rename + recovery_keys table)
- [ ] T004 [US2] Update `server/src/types.ts`: rename email→username in UserRecord/SessionUser, remove guest from WorkspaceRole/BoardRole, add RecoveryKeyRecord
- [ ] T005 [US2] Update `server/src/db/repositories.ts`: all email→username query references
- [ ] T006 [US2] Update `server/src/db/admin-repositories.ts`: all email→username query references
- [ ] T007 [US1] Gate seed data behind `SEED_DATA` env var in `server/src/seed/bootstrap.ts`
- [ ] T008 [US2] Update seed data to use `username` field instead of `email` in `server/src/seed/bootstrap.ts`
- [ ] T009 [US4] Remove `guest` from role arrays in `server/src/rbac/permissions.ts`
- [ ] T010 [US2] Update `server/src/auth/session.ts`: email→username references
- [ ] T011 [US2] Update `src/types.ts`: frontend User type email→username

## Phase 3: Foundation — Server Routes & Auth
- [ ] T012 [US1] Add `GET /api/auth/needs-bootstrap` endpoint in `server/src/routes/auth-routes.ts`
- [ ] T013 [US1] Add `POST /api/auth/bootstrap` endpoint in `server/src/routes/auth-routes.ts`
- [ ] T014 [US2] Update `POST /api/auth/login` to accept `username` instead of `email` in `server/src/routes/auth-routes.ts`
- [ ] T015 [US1] Add confirm-password validation to bootstrap and password-change endpoints
- [ ] T016 [US3] Add `POST /api/auth/recovery-key/generate` endpoint in `server/src/routes/auth-routes.ts`
- [ ] T017 [US3] Add `POST /api/auth/recovery-key/consume` endpoint in `server/src/routes/auth-routes.ts`
- [ ] T018 [US3] Add recovery key repository functions in `server/src/db/repositories.ts`
- [ ] T019 [US6] Add `POST /api/workspaces` endpoint in `server/src/routes/bootstrap-routes.ts`
- [ ] T020 [US2] Update `server/src/routes/admin-routes.ts`: email→username in create/update user
- [ ] T021 [US2] Update `server/src/routes/bootstrap-routes.ts`: email→username in bootstrap response

## Phase 4: US1 — Bootstrap Wizard (Frontend)
- [ ] T022 [US1] Update `src/lib/auth-context.tsx`: add bootstrap status check, handle needs-bootstrap state
- [ ] T023 [US1] Update `src/services/session.ts`: add `checkBootstrap()` and `submitBootstrap()` API calls
- [ ] T024 [US1] Update `src/components/AuthScreen.tsx`: add bootstrap wizard view with username + password + confirm password
- [ ] T025 [US1] Add confirm-password field to all password forms in `AuthScreen.tsx`

## Phase 5: US2 — Username Identity (Frontend)
- [ ] T026 [US2] Update `src/components/AuthScreen.tsx`: change email field to username field
- [ ] T027 [US2] Update `src/services/session.ts`: login with username instead of email
- [ ] T028 [US2] Update `src/services/admin.ts`: createUser/updateUser use username
- [ ] T029 [US2] Update `src/store.tsx`: any email references in state
- [ ] T030 [US2] Update `src/data.ts`: seed data email→username (for test/dev reference)

## Phase 6: US3 — Recovery Key (Frontend)
- [ ] T031 [US3] Add recovery key generation UI in authenticated settings area (Header.tsx or new component)
- [ ] T032 [US3] Add "Forgot Password?" link and recovery form to `src/components/AuthScreen.tsx`
- [ ] T033 [US3] Add recovery key API calls in `src/services/session.ts`

## Phase 7: US4 — Permission Matrix (Frontend & Tests)
- [ ] T034 [US4] Remove guest role references from `src/types.ts` and `src/lib/auth-context.tsx`
- [ ] T035 [US4] Update `src/components/AdminPanel.tsx` to not offer guest role in membership dropdowns

## Phase 8: US5 — Admin Panel Sub-Menus
- [ ] T036 [US5] Refactor `src/components/AdminPanel.tsx` into tabbed sub-views: EditUsers, CreateUser, Audit
- [ ] T037 [US5] Extract EditUsers sub-component with isolated state
- [ ] T038 [US5] Extract CreateUser sub-component with isolated state
- [ ] T039 [US5] Extract Audit sub-component with isolated state
- [ ] T040 [US5] Add tab navigation UI with clear active state indication

## Phase 9: US6 — Workspace Creation (Frontend)
- [ ] T041 [US6] Add workspace creation form/dialog in `src/components/Sidebar.tsx`
- [ ] T042 [US6] Add `createWorkspace()` API call in `src/services/admin.ts` or new service
- [ ] T043 [US6] Update store to handle workspace addition after creation

## Phase 10: US7 — Overlay Menus & Touch Friendly
- [ ] T044 [US7] Convert Sidebar to overlay/drawer on mobile viewports (< 768px)
- [ ] T045 [US7] Convert AdminPanel to overlay/drawer on mobile viewports
- [ ] T046 [US7] Add backdrop dismiss and Escape key handler for overlays
- [ ] T047 [US7] Audit and increase touch targets to minimum 44x44px across all interactive elements
- [ ] T048 [US7] Add minimum 8px spacing between interactive elements

## Phase 11: Test Updates
- [ ] T049 Update `server/tests/foundation.test.ts`: schema changes, email→username
- [ ] T050 Update `server/tests/auth-routes.test.ts`: username login, bootstrap, recovery endpoints
- [ ] T051 Update `server/tests/admin-routes.test.ts`: username references, guest removal
- [ ] T052 Update `server/tests/permissions.test.ts`: remove guest, align to desired matrix
- [ ] T053 Update `server/tests/rbac-matrix.test.ts`: full matrix alignment to desired_permissions.md
- [ ] T054 Update `src/App.auth.test.tsx`: bootstrap wizard, username login
- [ ] T055 Update `src/App.admin.test.tsx`: sub-menu navigation, isolated state
- [ ] T056 Update `src/App.rbac.test.tsx`: no guest role, permission alignment
- [ ] T057 Update `tests/contract/auth-rbac.contract.test.ts`: contract updates
- [ ] T058 Update `tests/e2e/app.spec.ts`: end-to-end flows with username, bootstrap

## Phase 12: Polish
- [ ] T059 [P] Remove any remaining email references across codebase (grep verification)
- [ ] T060 [P] Remove any remaining guest role references across codebase (grep verification)
- [ ] T061 [P] Update `src/data.ts` demo data to use username format
- [ ] T062 [P] Verify all forms have consistent error handling and validation feedback
