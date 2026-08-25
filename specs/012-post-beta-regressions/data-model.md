# Data Model: Post-Beta Consistency and Drag Reliability

## Navigation Selection

- `workspaceId: string | null`
- `boardId: string | null`
- Invariant: when `boardId` is non-null, that board exists, is accessible, and has `workspaceId` equal to the selected workspace.
- State transitions: workspace select, board select, session hydrate, workspace/board deletion, auth permission refresh.

## Card Due Date

- External/UI canonical value: `YYYY-MM-DD` or null.
- Legacy accepted read values: valid ISO strings beginning with `YYYY-MM-DD`.
- Invalid values: render no misleading date and remain safely editable/removable.
- No time, zone, or instant semantics.

## Drag Insertion Preview

- `kind: card | list`
- `sourceId: string`
- `sourceGroupId: string`
- `destinationGroupId: string`
- `destinationIndex: number`
- `sourceOrderSnapshot: string[] | Record<string,string[]>`
- `lastValidDestination: destination | null`
- Transition: start → project valid destination(s) → drop/cancel → clear; failed persistence restores snapshot.

## Automation Scope

- `workspaceId: string | null`
- `boardId: string | null`
- Workspace option eligibility: manageable workspace or workspace containing an automation-manageable board.
- Board option eligibility: belongs to selected workspace and `canManageAutomation(board.id)`.
- The rule/form collection is derived only from the valid selected board.

## Persistence

- No new SQLite table or column.
- New due-date writes normalize to date-only text in the existing nullable `cards.due_date` column.
- Existing card update and duplicate transactions remain authoritative.
