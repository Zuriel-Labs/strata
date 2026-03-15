# Data Model: Management Menu Inline Editing

## Workspace

- **Purpose**: Editable management entity shown in the Workspaces tab and as context for the Boards tab.
- **Relevant Fields**:
  - `id`: Stable workspace identifier.
  - `name`: Persisted workspace title shown in the management overlay.
  - `description`: Existing metadata preserved during rename.
  - `visibility`: Existing visibility value preserved during rename.
- **Validation Rules**:
  - `name` must be trimmed before save.
  - `name` must remain non-empty after trimming.

## Board

- **Purpose**: Editable management entity shown in the Boards tab for the selected workspace context.
- **Relevant Fields**:
  - `id`: Stable board identifier.
  - `title`: Persisted board title shown in the management overlay.
  - `workspaceId`: Links the board to the selected Boards tab workspace context.
  - `color`, `starred`, `labels`: Existing board fields preserved during rename.
- **Validation Rules**:
  - `title` must be trimmed before save.
  - `title` must remain non-empty after trimming.

## Workspace Rename Draft

- **Purpose**: Tracks which workspace row is editing and the draft title value.
- **Fields**:
  - `workspaceId`: Currently edited workspace row.
  - `draftName`: Input value being edited.
- **State Transitions**:
  - `idle -> editing` when a manageable workspace row is activated.
  - `editing -> saving` when Enter or blur submits a valid trimmed name.
  - `editing -> idle` when Escape cancels or a blank value is discarded.
  - `saving -> idle` after success or recoverable failure display.

## Board Rename Draft

- **Purpose**: Tracks which board row is editing and the draft title value.
- **Fields**:
  - `boardId`: Currently edited board row.
  - `draftTitle`: Input value being edited.
- **State Transitions**:
  - `idle -> editing` when a manageable board row is activated.
  - `editing -> saving` when Enter or blur submits a valid trimmed title.
  - `editing -> idle` when Escape cancels or a blank value is discarded.
  - `saving -> idle` after success or recoverable failure display.

## Boards Tab Workspace Context

- **Purpose**: Determines which workspace's boards are visible and editable in the Boards tab.
- **Fields**:
  - `workspaceId`: Selected workspace identifier for the board list.
  - `displayMode`: `static` when one workspace context is available, `select` when two or more are available.
- **Rules**:
  - Changing context refreshes the displayed board collection.
  - The selector only changes board-management context inside the overlay; it does not change the broader app workspace selection.
