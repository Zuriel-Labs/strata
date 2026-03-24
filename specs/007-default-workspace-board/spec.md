# Specification: Default Workspace/Board Preferences

**Feature Number**: 007
**Feature Name**: Default Workspace/Board Preferences
**Created**: 2026-03-24
**Status**: Draft

---

## 1. Summary

Allow users to configure their preferred default workspace and board in Settings → Preferences. When logging in, users will land on their configured default workspace and board instead of the alphabetically first ones. If a user has only one workspace or board, it will be auto-selected.

---

## 2. User Stories

### P1 - Core Preference Setting

**As a** user,  
**I want** to select a default workspace in my preferences,  
**So that** I land on my preferred workspace when I log in.

**Acceptance Scenarios**:
- Given I am on the Preferences page, when I open the default workspace dropdown, then I see all workspaces I have access to, ordered alphabetically.
- Given I have only one workspace, when I visit the Preferences page, then that workspace is auto-selected and the dropdown is disabled.
- Given I have multiple workspaces, when I select a workspace from the dropdown, then my selection is saved immediately.

### P2 - Board Selection Based on Workspace

**As a** user,  
**I want** to select a default board within my default workspace,  
**So that** I land on my preferred board when I log in.

**Acceptance Scenarios**:
- Given I have selected a default workspace, when I open the default board dropdown, then I see only boards in that workspace, ordered alphabetically.
- Given I have only one board in my selected workspace, when I visit the Preferences page, then that board is auto-selected and the dropdown is disabled.
- Given I have multiple boards in my selected workspace, when I select a board from the dropdown, then my selection is saved immediately.

### P3 - Auto-Selection Logic

**As a** user,  
**I want** the system to auto-select defaults when I have only one option,  
**So that** the preferences UI is simple and frictionless.

**Acceptance Scenarios**:
- Given I have only one workspace, when I navigate to Preferences, then my default workspace is already selected and I cannot change it.
- Given I have only one board in my default workspace, when I navigate to Preferences, then my default board is already selected and I cannot change it.
- Given I have no boards in my default workspace, when I navigate to Preferences, then the board dropdown is disabled with a message "No boards in this workspace."

### P4 - Login Redirection

**As a** user,  
**I want** to land on my default workspace and board after logging in,  
**So that** I can quickly access my main work area.

**Acceptance Scenarios**:
- Given I have configured a default workspace and board, when I log in, then I am redirected to my default workspace and board.
- Given I have configured only a default workspace (no board preference), when I log in, then I am redirected to my default workspace and the most recently viewed board in that workspace.
- Given I have not configured any default preferences, when I log in, then I am redirected to the alphabetically first workspace and board (existing behavior).

---

## 3. Requirements

### FR-001: Default Workspace Preference
- User can select a default workspace from a dropdown in Settings → Preferences
- Dropdown shows all workspaces the user has access to, ordered alphabetically by name
- Selection is persisted to the database immediately upon change
- If user has only 1 workspace, it is auto-selected and the dropdown is disabled

### FR-002: Default Board Preference
- User can select a default board from a dropdown in Settings → Preferences
- Board dropdown is dependent on the selected workspace (only shows boards in that workspace)
- Dropdown shows boards ordered alphabetically by title
- Selection is persisted to the database immediately upon change
- If user has only 1 board in the selected workspace, it is auto-selected and the dropdown is disabled

### FR-003: Auto-Selection for Single Options
- If a user has exactly 1 workspace, the workspace dropdown is disabled with the single option pre-selected
- If a user has exactly 1 board in their default workspace, the board dropdown is disabled with the single option pre-selected
- The UI clearly indicates that a dropdown is disabled due to having only one option

### FR-004: Login Redirection to Defaults
- On login, the system checks for user-defined default workspace and board preferences
- If preferences exist, the user is redirected to those defaults instead of alphabetically first
- If only workspace preference exists, user goes to that workspace with most recent board
- If no preferences exist, existing alphabetically-first behavior is preserved

### FR-005: Preferences UI Layout
- Preferences section contains a "Default Workspace" dropdown
- Selecting a workspace reveals a "Default Board" dropdown below it
- Both dropdowns have clear labels
- Disabled dropdowns show a tooltip explaining why they are disabled

---

## 4. Data Model

### User Preferences Fields (users table)
- `default_workspace_id` (TEXT, nullable, FK → workspaces.id)
- `default_board_id` (TEXT, nullable, FK → boards.id)

### Validation Rules
- `default_workspace_id` must reference a workspace the user has access to
- `default_board_id` must reference a board in the specified workspace that the user has access to
- If `default_workspace_id` is NULL, `default_board_id` must also be NULL

---

## 5. API Changes

### PATCH /api/auth/preferences
**Request Body**:
```json
{
  "defaultWorkspaceId": "uuid" | null,
  "defaultBoardId": "uuid" | null
}
```

**Response**: Updated user preferences object

**Validation**:
- If `defaultWorkspaceId` is provided, verify user has access to that workspace
- If `defaultBoardId` is provided, verify:
  - Board exists
  - Board is in the specified workspace
  - User has access to that board

### GET /api/auth/session (bootstrap)
Returns session payload including:
```json
{
  "user": {
    "defaultWorkspaceId": "uuid" | null,
    "defaultBoardId": "uuid" | null
  },
  "currentWorkspaceId": "uuid",
  "currentBoardId": "uuid"
}
```

The `currentWorkspaceId` and `currentBoardId` in the session payload will use the user's default preferences if set, otherwise fall back to alphabetically-first.

---

## 6. Success Criteria

1. User can view and modify their default workspace in Preferences
2. User can view and modify their default board in Preferences
3. Single-workspace users see their workspace auto-selected and cannot change it
4. Single-board users see their board auto-selected and cannot change it
5. Login redirects to user's configured defaults when set
6. Login falls back to alphabetically-first when no defaults configured
7. Preferences persist across sessions
8. Users without access to any workspaces see an appropriate message

---

## 7. Out of Scope

- Bulk editing of preferences for multiple users (admin feature)
- Workspace/board defaulting for new users (onboarding)
- Remembering "last viewed" workspace/board (separate feature)
