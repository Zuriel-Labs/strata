# Feature Specification: Management Menu Inline Editing

**Feature Branch**: `008-management-menu-edit`
**Created**: 2026-03-14
**Status**: Draft
**Input**: User description: "The Management Menu; When selecting a workspace or board in their respective tabs, it doesn't do anything else except the set the Title in edit mode, allowing the user to edit the title. Then they can press Enter/Return or just click/touch away from the edit field to submit the change. Similar to when you create a workspace or board, you just get a field you can edit to add the title.

Side Item: in the Boards tab, it shows \"Workspace: <workspace title>\" at the top of the list of Boards. Just like the Automations, the <workspace title> must be a drop down if there are 2 or more workspaces to choose from so the admin can pick which workspace they want to edit the boards. If only 1 workspace, then it is static, similar to how it is now."

## Overview

Make the Management menu behave like an inline editor for workspace names and board titles instead of using row selection for navigation. Admins should be able to tap a workspace or board row to rename it in place, submit with Enter or blur, and choose which workspace's boards to manage from a dropdown when multiple workspaces are available.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rename a workspace inline (Priority: P1)

As an admin managing workspaces, I want clicking a workspace row in the Management menu to turn its title into an editable field so I can rename it immediately without being moved to another tab.

**Why this priority**: Workspace selection currently changes the overlay flow instead of enabling the requested edit behavior, so this is the primary workflow correction.

**Independent Test**: Open the Management menu on the Workspaces tab, activate a workspace row, confirm its name becomes an inline input, change the title, and submit with Enter or by blurring the field while the overlay remains in place.

**Acceptance Scenarios**:

1. **Given** I am on the Workspaces tab and can manage a workspace, **When** I activate that workspace row, **Then** the row stays in the Workspaces tab and its title enters inline edit mode.
2. **Given** a workspace title is in inline edit mode, **When** I press Enter, **Then** the new title is saved and the row exits edit mode with the updated title.
3. **Given** a workspace title is in inline edit mode, **When** I click or tap away from the input, **Then** the new title is saved and the row exits edit mode.

---

### User Story 2 - Rename a board inline (Priority: P1)

As an admin managing boards, I want clicking a board row in the Boards tab to turn its title into an editable field so I can rename the board directly from the Management menu.

**Why this priority**: Board titles need to follow the same requested inline-edit pattern as workspaces and new-item creation.

**Independent Test**: Open the Boards tab, activate a board row, confirm its title becomes an inline input, change the title, and submit with Enter or blur without closing the overlay or triggering unrelated navigation.

**Acceptance Scenarios**:

1. **Given** I am on the Boards tab and can manage a board, **When** I activate that board row, **Then** the board title enters inline edit mode in place.
2. **Given** a board title is in inline edit mode, **When** I press Enter, **Then** the new title is saved and shown in the list.
3. **Given** a board title is in inline edit mode, **When** I click or tap away from the input, **Then** the new title is saved and shown in the list.

---

### User Story 3 - Choose the workspace context for board editing (Priority: P2)

As an admin with access to multiple workspaces, I want the Boards tab header to let me switch between workspaces so I can choose which workspace's boards I am editing.

**Why this priority**: Once workspace rows stop acting as tab navigation, the Boards tab still needs a direct way to switch editing context.

**Independent Test**: Open the Boards tab with multiple manageable workspaces, switch the workspace from the header dropdown, and verify the listed boards update to that workspace; repeat with a single workspace and confirm the header stays static.

**Acceptance Scenarios**:

1. **Given** I can manage boards in two or more workspaces, **When** I open the Boards tab, **Then** the workspace name in the header is a dropdown listing the available workspaces.
2. **Given** I change the Boards tab workspace dropdown, **When** the selection updates, **Then** the list refreshes to show boards for the chosen workspace.
3. **Given** there is only one available workspace context for the Boards tab, **When** I view the header, **Then** the workspace title is shown as static text instead of a dropdown.

---

### Edge Cases

- If an inline edit is submitted with only whitespace, the title should revert to the previous saved value rather than saving a blank name.
- If the user presses Escape during inline editing, the pending rename should cancel and the previous saved title should remain visible.
- If another row is activated while one title is still being edited, the in-progress edit should finish cleanly before the next row becomes editable.
- If a selected workspace has no boards, the Boards tab should still show the chosen workspace context and allow adding or renaming boards when applicable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Activating a manageable workspace row in the Management menu MUST place that workspace title into inline edit mode instead of switching tabs or changing the broader app selection.
- **FR-002**: Workspace inline editing MUST allow submission by pressing Enter or by blurring the edit field.
- **FR-003**: Submitting a workspace inline edit with a non-empty trimmed title MUST persist the updated workspace name and show it in the Workspaces tab.
- **FR-004**: Activating a manageable board row in the Boards tab MUST place that board title into inline edit mode instead of changing broader app navigation.
- **FR-005**: Board inline editing MUST allow submission by pressing Enter or by blurring the edit field.
- **FR-006**: Submitting a board inline edit with a non-empty trimmed title MUST persist the updated board title and show it in the Boards tab.
- **FR-007**: Inline title editing for workspaces and boards MUST preserve the existing Management overlay, including delete actions and create-new flows.
- **FR-008**: The Boards tab header MUST show the current workspace as a dropdown when two or more editable workspace contexts are available.
- **FR-009**: Changing the Boards tab workspace dropdown MUST update the board list to the selected workspace without leaving the Boards tab.
- **FR-010**: The Boards tab header MUST show static workspace text when only one editable workspace context is available.
- **FR-011**: Blank or whitespace-only inline title submissions MUST NOT overwrite an existing workspace or board title.
- **FR-012**: Pressing Escape during inline title editing MUST cancel the pending rename and restore the previous saved title.

### Key Entities *(include if feature involves data)*

- **Workspace Rename Draft**: The temporary title value and editing state for a workspace row while the admin is renaming it.
- **Board Rename Draft**: The temporary title value and editing state for a board row while the admin is renaming it.
- **Boards Tab Workspace Context**: The currently selected workspace whose boards are shown and managed in the Boards tab.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Admins can rename a workspace from the Workspaces tab using inline editing without being moved to another tab.
- **SC-002**: Admins can rename a board from the Boards tab using inline editing with either Enter or blur submission.
- **SC-003**: In multi-workspace setups, the Boards tab workspace context can be switched directly from the header dropdown.
- **SC-004**: Existing create and delete flows in the Management menu continue to work in regression coverage after the inline editing change.
