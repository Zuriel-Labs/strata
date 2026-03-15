# Tasks: Admin User Deletion Workflow (006-delete-user-workflow)

## Phase 1: Setup
- [x] T001 [P] Review the existing admin panel, admin service, and server user-management flows referenced in `src/components/AdminPanel.tsx`, `src/services/admin.ts`, and `server/src/routes/admin-routes.ts`

## Phase 2: Foundation
- [x] T002 [US2] Add repository helpers for deleting a managed user, scrubbing card member references, and remediating automation assignment targets in `server/src/db/admin-repositories.ts` and `server/src/db/repositories.ts`
- [x] T003 [US2] Add an admin-only delete route with safety guardrails and cleanup summary responses in `server/src/routes/admin-routes.ts`
- [x] T004 [US2] Add client service support for deleting managed users in `src/services/admin.ts`

## Phase 3: User Story 1 - Destructive confirmation flow (Priority: P1)
- [x] T005 [US1] Add delete-flow state, overlays, and exact-confirmation interactions to `src/components/AdminPanel.tsx`
- [x] T006 [US1] Place the red `Delete User` action in the Edit Users layout and reset delete state correctly on cancel, selection change, and success in `src/components/AdminPanel.tsx`

## Phase 4: User Story 2 - Account obliteration with preserved history (Priority: P1)
- [x] T007 [US2] Return deletion cleanup metadata and refresh directory state after a successful delete in `src/components/AdminPanel.tsx` and `src/services/admin.ts`
- [x] T008 [US2] Render deleted-user fallbacks for preserved comment and activity history in `src/components/CardModal.tsx`
- [x] T009 [US2] Ensure deleted users no longer appear as card members or automation assignment targets by updating cleanup logic in `server/src/db/admin-repositories.ts` and related repository helpers

## Phase 5: User Story 3 - Platform safety guardrails (Priority: P2)
- [x] T010 [US3] Enforce self-delete and last-system-admin protections in `server/src/db/admin-repositories.ts` and `server/src/routes/admin-routes.ts`
- [x] T011 [US3] Surface clear failure messaging and reset destructive UI state for rejected deletes in `src/components/AdminPanel.tsx`

## Phase 6: Regression Coverage
- [x] T012 [US1] Add admin UI coverage for both confirmation steps, cancel flows, and exact `DELETE` enforcement in `src/App.admin.test.tsx`
- [x] T013 [US2] Add server integration coverage for successful delete cleanup and historical-reference preservation expectations in `server/tests/admin-routes.test.ts`
- [x] T014 [US3] Add server integration coverage for self-delete and last-admin rejection paths in `server/tests/admin-routes.test.ts`

## Phase 7: Polish
- [x] T015 [P] Verify the destructive flow remains touch-friendly and visually consistent in `src/components/AdminPanel.tsx`
- [x] T016 [P] Run targeted lint and test validation for admin deletion changes from the existing project scripts in `package.json`
