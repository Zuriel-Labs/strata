# Tasks: Server-Backed Auth and RBAC

**Input**: Design documents from `/specs/001-auth-rbac-backend/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`

**Tests**: Include backend auth/RBAC unit and integration tests, plus frontend authenticated/admin flow tests.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently after the shared foundation is complete.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Create the backend directory structure and shared server entry files in `server/src/` and `server/tests/`
- [x] T002 Add backend runtime dependencies and dev scripts in `package.json`
- [x] T003 [P] Extend TypeScript, Vitest, and ESLint configuration for `server/**/*.ts` and shared tests
- [x] T004 [P] Add `.env.example` and update `.gitignore` for SQLite data and session secrets

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T005 Create SQLite schema initialization and seed bootstrap logic in `server/src/db/schema.ts` and `server/src/seed/bootstrap.ts`
- [x] T006 [P] Implement database access and repository helpers in `server/src/db/database.ts` and `server/src/db/repositories.ts`
- [x] T007 [P] Implement password hashing, password policy, and temporary password utilities in `server/src/auth/passwords.ts`
- [x] T008 [P] Implement session cookie, session storage, and auth middleware in `server/src/auth/session.ts` and `server/src/http/auth-middleware.ts`
- [x] T009 [P] Implement RBAC evaluators for platform, workspace, and board scopes in `server/src/rbac/permissions.ts`
- [x] T010 Implement Express app setup, JSON/cookie middleware, error responses, and API mounting in `server/src/app.ts` and `server/src/index.ts`
- [x] T011 Add foundational backend tests for schema bootstrap, sessions, password utilities, and permission evaluation in `server/tests/foundation.test.ts`

**Checkpoint**: Backend foundation ready for authenticated and authorized feature work.

---

## Phase 3: User Story 1 - Sign in to a real server-backed workspace (Priority: P1) 🎯 MVP

**Goal**: Replace browser-local seeded auth assumptions with real server authentication and authorized bootstrap loading.

**Independent Test**: Sign in as the bootstrap administrator, restore the session after reload, and confirm unauthenticated requests are rejected.

### Tests for User Story 1

- [x] T012 [P] [US1] Add auth API integration tests for login, session restore, logout, and forced password change in `server/tests/auth-routes.test.ts`
- [x] T013 [P] [US1] Add frontend auth-shell tests for unauthenticated, authenticated, and forced-password-change states in `src/App.auth.test.tsx`

### Implementation for User Story 1

- [x] T014 [P] [US1] Implement auth routes for login, logout, session restore, and password change in `server/src/routes/auth-routes.ts`
- [x] T015 [US1] Implement authorized workspace bootstrap assembly in `server/src/routes/bootstrap-routes.ts`
- [x] T016 [P] [US1] Add frontend API client and auth/bootstrap service layer in `src/services/api.ts` and `src/services/session.ts`
- [x] T017 [US1] Refactor `src/store.tsx` to hydrate from server bootstrap data instead of local storage seeds
- [x] T018 [US1] Add sign-in and forced-password-change screens in `src/components/AuthScreen.tsx`
- [x] T019 [US1] Wire authenticated app shell gating and session restore in `src/App.tsx`

**Checkpoint**: Authorized users can sign in and use the main app with server-backed state.

---

## Phase 4: User Story 2 - Admin manages users, roles, and memberships (Priority: P2)

**Goal**: Give system administrators a protected control surface for user lifecycle, workspace membership, and password resets.

**Independent Test**: Create a user, assign workspace access, trigger a reset, and verify the admin-visible result and audit record.

### Tests for User Story 2

- [x] T020 [P] [US2] Add admin API integration tests for user CRUD, membership assignment, and password reset in `server/tests/admin-routes.test.ts`
- [x] T021 [P] [US2] Add frontend admin flow tests for user creation and password reset in `src/App.admin.test.tsx`

### Implementation for User Story 2

- [x] T022 [P] [US2] Implement audit logging service and admin repositories in `server/src/audit/audit-log.ts` and `server/src/db/admin-repositories.ts`
- [x] T023 [US2] Implement admin user, membership, and password reset routes in `server/src/routes/admin-routes.ts`
- [x] T024 [P] [US2] Add admin-facing data models and API methods in `src/types.ts` and `src/services/admin.ts`
- [x] T025 [US2] Add system-admin management UI for users, roles, memberships, and reset actions in `src/components/AdminPanel.tsx`
- [x] T026 [US2] Integrate the admin area into the existing shell and header actions in `src/components/Header.tsx` and `src/App.tsx`

**Checkpoint**: System administrators can manage people and recover credentials without editing seed data.

---

## Phase 5: User Story 3 - Role enforcement protects boards and administration flows (Priority: P3)

**Goal**: Enforce scoped authorization consistently across admin and collaborative operations.

**Independent Test**: Sign in with different scoped users and verify allowed and denied actions across workspaces, boards, and admin features.

### Tests for User Story 3

- [x] T027 [P] [US3] Add role matrix integration tests for workspace admin, board admin, member, observer, and guest access in `server/tests/rbac-matrix.test.ts`
- [x] T028 [P] [US3] Add frontend access-denied tests for scoped roles in `src/App.rbac.test.tsx`

### Implementation for User Story 3

- [x] T029 [P] [US3] Implement scoped authorization helpers for workspace and board mutations in `server/src/rbac/policies.ts`
- [x] T030 [US3] Apply authorization checks to protected collaborative and admin endpoints in `server/src/routes/auth-routes.ts`, `server/src/routes/admin-routes.ts`, and `server/src/routes/bootstrap-routes.ts`
- [x] T031 [P] [US3] Add frontend role-aware navigation and access-denied messaging in `src/components/Sidebar.tsx`, `src/components/Header.tsx`, and `src/components/AccessDenied.tsx`
- [x] T032 [US3] Ensure server bootstrap filtering and client rendering only expose authorized workspaces and boards in `server/src/routes/bootstrap-routes.ts` and `src/store.tsx`

**Checkpoint**: Scoped roles are enforced by the API and reflected clearly in the UI.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T033 [P] Document backend setup, bootstrap credentials, and auth/RBAC flows in `README.md`
- [x] T034 Add contract assertions or snapshot validation against `specs/001-auth-rbac-backend/contracts/openapi.yaml` in `tests/contract/auth-rbac.contract.test.ts`
- [x] T035 [P] Add or update GitHub Actions coverage for lint, backend/frontend tests, build, and auth smoke checks in `.github/workflows/ci.yml`
- [x] T036 Run quickstart validation and align feature artifacts with final implementation in `specs/001-auth-rbac-backend/*.md`

---

## Dependencies & Execution Order

- Setup tasks (T001-T004) precede all backend and frontend auth work.
- Foundational tasks (T005-T011) block all user stories.
- US1 (T012-T019) establishes real authentication and must land before admin or scoped RBAC UX.
- US2 (T020-T026) depends on foundation and the authenticated shell.
- US3 (T027-T032) depends on foundation and may reuse US1/US2 infrastructure.
- Polish tasks (T033-T036) run after the core stories are working.
