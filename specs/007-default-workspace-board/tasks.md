# Tasks: Default Workspace/Board Preferences

**Feature**: 007 - Default Workspace/Board Preferences

---

## Phase 1: Database Migration

- [ ] **T-1.1**: Add migration for new user preference columns
  - Add `default_workspace_id` TEXT NULLABLE column to `users` table
  - Add `default_board_id` TEXT NULLABLE column to `users` table
  - Follow existing migration pattern in `schema.ts`

---

## Phase 2: Server-Side Repository Changes

- [ ] **T-2.1**: Update `UserRecord` type in `server/src/types.ts`
  - Add `defaultWorkspaceId: string | null`
  - Add `defaultBoardId: string | null`

- [ ] **T-2.2**: Update `mapUser` function in `repositories.ts`
  - Map `default_workspace_id` → `defaultWorkspaceId`
  - Map `default_board_id` → `defaultBoardId`

- [ ] **T-2.3**: Update `updateUserThemePreference` to `updateUserPreferences`
  - Create new function that updates theme preference AND default workspace/board
  - Handle validation of workspace/board ownership

- [ ] **T-2.4**: Update `buildSessionPayload` in `repositories.ts`
  - Modify `currentWorkspaceId` logic to use `user.defaultWorkspaceId` if set
  - Modify `currentBoardId` logic to use `user.defaultBoardId` if set
  - Fall back to alphabetically-first when defaults not set

- [ ] **T-2.5**: Add helper function to validate workspace access
  - `userHasAccessToWorkspace(db, userId, workspaceId): boolean`

- [ ] **T-2.6**: Add helper function to validate board access
  - `userHasAccessToBoard(db, userId, boardId): boolean`
  - Verify board is in the specified workspace

---

## Phase 3: API Route Changes

- [ ] **T-3.1**: Update `preferencesUpdateSchema` in `auth-routes.ts`
  - Add optional `defaultWorkspaceId: z.string().uuid().nullable()`
  - Add optional `defaultBoardId: z.string().uuid().nullable()`
  - Add custom refinement: board requires workspace

- [ ] **T-3.2**: Update `PATCH /api/auth/preferences` handler
  - Call updated `updateUserPreferences` function
  - Return updated user with new preferences

- [ ] **T-3.3**: Update `SessionUser` type in `server/src/types.ts`
  - Add `defaultWorkspaceId: string | null`
  - Add `defaultBoardId: string | null`

- [ ] **T-3.4**: Update `buildSessionUser` helper function
  - Include new preference fields in returned object

---

## Phase 4: Client-Side Type Changes

- [ ] **T-4.1**: Update `SessionUser` type in `src/types.ts`
  - Add `defaultWorkspaceId: string | null`
  - Add `defaultBoardId: string | null`

- [ ] **T-4.2**: Update `auth.updatePreferences` in `auth-context.tsx`
  - Accept and send `defaultWorkspaceId` and `defaultBoardId`

- [ ] **T-4.3**: Update session service in `src/services/session.ts`
  - Ensure new preference fields are sent when updating preferences

---

## Phase 5: UI Changes (ProfileOverlay)

- [ ] **T-5.1**: Add state for workspace/board preferences
  - `defaultWorkspaceId: string | null`
  - `defaultBoardId: string | null`
  - Initialize from `sessionUser` on open

- [ ] **T-5.2**: Get accessible workspaces for dropdown
  - Use `appState.workspaces` for the dropdown options

- [ ] **T-5.3**: Get boards for selected workspace
  - Filter `appState.boards` by selected workspace ID

- [ ] **T-5.4**: Implement workspace dropdown
  - Render dropdown with all accessible workspaces (sorted alphabetically)
  - Auto-select if only 1 workspace exists

- [ ] **T-5.5**: Implement board dropdown (dependent on workspace)
  - Render dropdown with boards in selected workspace (sorted alphabetically)
  - Auto-select if only 1 board exists in workspace
  - Disable/clear when no workspace selected

- [ ] **T-5.6**: Implement disabled state for single-option dropdowns
  - If `workspaces.length === 1`: disable workspace dropdown, show tooltip
  - If `filteredBoards.length === 1`: disable board dropdown, show tooltip

- [ ] **T-5.7**: Update `handlePreferencesSave`
  - Send all preference fields: theme, workspace, board

- [ ] **T-5.8**: Update Preferences view description
  - Change from "Choose the theme..." to include workspace/board options

---

## Phase 6: Testing

- [ ] **T-6.1**: Add unit tests for `buildSessionPayload` with defaults
  - Test when user has defaults set
  - Test when user has only workspace default
  - Test when user has no defaults

- [ ] **T-6.2**: Add integration tests for PATCH /api/auth/preferences
  - Test updating workspace preference
  - Test updating board preference
  - Test validation errors

- [ ] **T-6.3**: Add E2E test for preference setting flow
  - User sets default workspace
  - User sets default board
  - User logs out and back in
  - Verify landing on default workspace/board
