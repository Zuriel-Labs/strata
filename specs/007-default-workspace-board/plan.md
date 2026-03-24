# Plan: Default Workspace/Board Preferences

**Feature Number**: 007
**Feature Name**: Default Workspace/Board Preferences
**Created**: 2026-03-24

---

## 1. Technical Context

**Language/Version**: TypeScript 5.9
**Primary Dependencies**: React 19, Express, better-sqlite3, Zod v4, bcryptjs
**Storage**: SQLite database
**Testing Framework**: Vitest (unit/integration), Playwright (E2E)
**Target Platform**: Web application (React client + Express server)

---

## 2. Data Model

### Users Table Changes
Add two nullable TEXT columns to `users` table:
- `default_workspace_id` - FK to workspaces.id, nullable
- `default_board_id` - FK to boards.id, nullable

### Validation Rules
- `default_workspace_id` must reference a workspace the user has access to
- `default_board_id` must reference a board in the specified workspace that the user has access to
- If `default_workspace_id` is NULL, `default_board_id` must also be NULL

---

## 3. API Contracts

### PATCH /api/auth/preferences

**Request Body**:
```json
{
  "themePreference": "dark" | "light",
  "defaultWorkspaceId": "uuid" | null,
  "defaultBoardId": "uuid" | null
}
```

**Response**: Updated user preferences object

### GET /api/auth/session (bootstrap)

Returns session payload including user preferences:
```json
{
  "user": {
    "id": "uuid",
    "defaultWorkspaceId": "uuid" | null,
    "defaultBoardId": "uuid" | null,
    ...
  },
  "currentWorkspaceId": "uuid",
  "currentBoardId": "uuid"
}
```

---

## 4. Session Payload Changes

The `buildSessionPayload` function will be modified to:
1. Check if user has `default_workspace_id` set
2. If set, use that as `currentWorkspaceId`
3. If set, check for `default_board_id` and use that as `currentBoardId`
4. If only workspace is set, fall back to alphabetically-first board in that workspace
5. If no defaults set, use existing alphabetically-first logic

---

## 5. UI Changes

### ProfileOverlay.tsx Preferences View
Add two new dropdown fields:
- "Default Workspace" - dropdown of all accessible workspaces
- "Default Board" - dropdown of boards in selected workspace (dependent dropdown)

### Auto-Selection Behavior
- If user has exactly 1 workspace → workspace dropdown disabled, pre-selected
- If user has exactly 1 board in selected workspace → board dropdown disabled, pre-selected

---

## 6. Implementation Phases

### Phase 1: Database Migration
- Add migration for `default_workspace_id` and `default_board_id` columns
- Add `updateUserPreferences` function to handle new fields

### Phase 2: API Changes
- Update `preferencesUpdateSchema` to accept optional `defaultWorkspaceId` and `defaultBoardId`
- Update `buildSessionPayload` to respect user defaults

### Phase 3: Client Changes
- Update `SessionUser` type to include `defaultWorkspaceId` and `defaultBoardId`
- Update `ProfileOverlay` to add workspace/board dropdowns in Preferences view
- Implement dependent dropdown logic (workspace → board)
- Implement auto-selection when only 1 option exists

### Phase 4: Testing
- Unit tests for repository functions
- Integration tests for API
- E2E tests for user flow
