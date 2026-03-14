# Strata Acceptance Criteria

Here are acceptance criteria for each item, organized by priority.

## P0 - Critical

### Branding: FlowBoard -> Strata

- Browser tab title displays `Strata` on all app pages.
- No user-facing text in the app shows `FlowBoard`.
- No auth, board, card, workspace, or settings view shows `FlowBoard`.
- Existing functionality is unchanged after the rename.

### Automation permissions

- `System Admin`, `Workspace Admin`, and `Board Admin` can view and use automations where they have board access.
- Regular `Members` cannot see automation creation or edit controls.
- Regular `Members` cannot create, edit, delete, enable, or disable automations through the UI.
- Server-side authorization rejects automation changes from unauthorized users.

### Archive / unarchive permissions

- `System Admin`, `Workspace Admin`, and `Board Admin` can archive and unarchive boards/cards within their allowed scope.
- Regular `Members` cannot see archive/unarchive actions for boards or cards.
- Unauthorized archive/unarchive API requests are rejected.
- Existing archive/unarchive behavior still works for authorized users.

### Permission consistency

- `System Admins` retain full access across all workspaces, boards, cards, labels, and automations.
- `Workspace Admins` retain full workspace/board/card permissions only inside workspaces they administer.
- `Board Admins` retain full board/card permissions only inside boards they administer.
- `Members` retain allowed card-level actions only in boards where they are members.
- New label-management and automation features follow the same RBAC model in both UI visibility and API enforcement.

## P1 - High

### Card creation UX

- Clicking `Add a card` opens a title input immediately.
- Only the input field is shown; redundant `Add` and `X` buttons are removed.
- Pressing `Enter/Return` creates the card.
- Empty or whitespace-only titles are not submitted.
- After successful submit, the card appears in the correct list.
- Behavior works on desktop and touch devices.

### Board-level label management

- A `Labels` control is visible in the board view, placed at the top-right.
- Only `Board Admins` and higher can open and use the label management UI.
- Opening the control displays an overlay/menu for managing labels in the current board only.
- Admins can create a new label.
- Admins can edit an existing label’s name and any supported visual properties.
- Admins can delete a label from the current board.
- The default 3 labels exist on new/existing boards but can be edited or removed by board admins.
- Label changes persist after refresh.
- Label changes affect only the active board, not other boards.

### Card label picker

- Every card shows a visible `Labels` button at all times.
- Clicking `Labels` opens a dropdown/overlay instead of adding disabled labels.
- The picker includes a search field.
- Search filters labels by name in real time.
- The picker lists all labels available on the current board.
- Clicking a label in the picker adds it to the card.
- Added labels appear on the card immediately.
- Clicking an applied label on the card removes it from the card.
- Adding/removing labels respects user permissions.
- No extra behaviors from the reference example are included beyond searchable selection.

### Card member display

- Assigned card members display as circular avatars with initials only.
- Member full names are no longer shown in the card member chip/display area.
- Clicking an assigned member still removes them from the card, if the user has permission.
- Existing member assignment behavior otherwise remains unchanged.

## P2 - Medium

### Automation: date/time trigger

- Automation trigger options include a date/time-based trigger.
- A user can configure a specific date and time for an automation to run.
- Saved trigger settings persist after refresh.
- The automation executes at the configured time.

### Automation: weekday trigger

- A user can configure an automation to run on selected weekday(s) at a specified time.
- Example schedules like `Fridays at 3:00 PM` are supported.
- Saved weekday schedules persist after refresh.
- The automation executes only on the configured weekday/time schedule.

### Automation: day-of-month trigger

- A user can configure an automation to run on a specific day of the month.
- The schedule can include a time of day.
- Saved monthly schedules persist after refresh.
- The automation executes on the configured monthly schedule.

### Automation: heartbeat trigger

- A user can configure an automation to run every `X minutes` or `X hours`.
- The interval is validated to prevent invalid values.
- Saved interval settings persist after refresh.
- The automation runs repeatedly according to the configured interval.

### Automation: Labels condition

- A `Labels` dropdown appears below the existing `Lists` dropdown in the automation conditions UI.
- The default option is `Any labels`.
- The dropdown includes all current labels from the active board.
- Selecting a label saves that label as the condition.
- If labels change on the board, the dropdown reflects the current board label set.
- The condition evaluates correctly during automation execution.

### Terminology cleanup

- Any UI text or schema field displayed to users uses `Labels`, not `Lables`.

## Cross-cutting acceptance criteria

- All new UI is responsive and usable on desktop and mobile.
- All new features are enforced server-side, not just hidden in the UI.
- Existing tests are updated or expanded to cover new RBAC and label behavior.
- No regression in existing board, card, member, archive, or automation flows.
