# Tasks: Management Menu Inline Editing (008-management-menu-edit)

## Phase 1: Setup
- [x] T001 [P] Review existing management overlay row interactions and rename API gaps in `src/components/NavigationOverlay.tsx`, `src/services/admin.ts`, `src/services/data.ts`, `server/src/routes/bootstrap-routes.ts`, and `server/src/routes/board-routes.ts`

## Phase 2: Foundation
- [x] T002 Add workspace and board rename service helpers plus client action types in `src/services/admin.ts`, `src/services/data.ts`, `src/types.ts`, and `src/store.tsx`
- [x] T003 Add workspace and board rename persistence routes in `server/src/routes/bootstrap-routes.ts`, `server/src/routes/board-routes.ts`, and `server/src/db/repositories.ts`

## Phase 3: User Story 1 - Rename a workspace inline (Priority: P1)
- [x] T004 [US1] Replace workspace row selection with inline workspace rename state and submission flow in `src/components/NavigationOverlay.tsx`
- [x] T005 [US1] Add workspace rename regression coverage for Enter, blur, and Escape behavior in `src/components/NavigationOverlay.test.tsx`
- [x] T006 [US1] Add server coverage for workspace rename authorization and validation in `server/tests/crud-routes.test.ts` and `server/tests/rbac-routes.test.ts`

## Phase 4: User Story 2 - Rename a board inline (Priority: P1)
- [x] T007 [US2] Replace board row selection behavior with inline board rename state and submission flow in `src/components/NavigationOverlay.tsx`
- [x] T008 [US2] Add board rename regression coverage for Enter, blur, and Escape behavior in `src/components/NavigationOverlay.test.tsx`
- [x] T009 [US2] Add server coverage for board rename authorization and validation in `server/tests/crud-routes.test.ts` and `server/tests/rbac-routes.test.ts`

## Phase 5: User Story 3 - Choose the workspace context for board editing (Priority: P2)
- [x] T010 [US3] Add Boards tab workspace header selection behavior and context-aware board filtering in `src/components/NavigationOverlay.tsx`
- [x] T011 [US3] Extend overlay tests for multi-workspace selector and single-workspace static header behavior in `src/components/NavigationOverlay.test.tsx`

## Phase 6: Polish
- [x] T012 [P] Preserve create/delete/starring flows while integrating inline editing in `src/components/NavigationOverlay.tsx` and `src/components/NavigationOverlay.test.tsx`
- [x] T013 Run targeted client and server tests for management menu rename workflows
