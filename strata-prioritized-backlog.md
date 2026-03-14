# Strata Prioritized Backlog

Here’s a cleaned up, organized, and prioritized version of the list for Strata.

## Prioritized Backlog

- `P0 - Critical`: fix branding, lock down permissions, and preserve RBAC consistency
- `P1 - High`: improve label management and card UX
- `P2 - Medium`: expand automation triggers and conditions

## P0 - Critical

- Replace all references to `FlowBoard` with `Strata`, including the browser tab title and any remaining UI text.
- Validate that automations are only visible and usable by `Board Admins` and higher.
- Validate that board/card archive and unarchive actions are only visible and usable by `Board Admins` and higher.
- Preserve permission consistency across all related changes:
  - `System Admins`: full access everywhere
  - `Workspace Admins`: all workspace, board, and card permissions within their workspaces
  - `Board Admins`: all board and card permissions within their boards
  - `Members`: most card permissions within boards where they are members

## P1 - High

- Simplify card creation UX:
  - Keep `Add a card` as the entry point
  - After opening the input, show only the title field
  - Submit on `Enter/Return`
  - Remove redundant `Add` and `X` buttons
- Add board-level label management for `Board Admins`:
  - Add a `Labels` button/panel in the board view, top-right
  - Open an overlay/menu for managing labels on the current board
  - Allow add, edit, and remove of labels
  - Keep the current default 3 labels, but make them editable/removable
- Redesign card label assignment:
  - Keep the `Labels` button always visible on cards
  - Replace the current disabled/full-list behavior with a searchable dropdown
  - Show `all labels available on the current board`
  - Clicking a label adds it to the card
  - Clicking an applied label on the card removes it
  - Ignore extra behaviors from the example file except search/filter
- Simplify card member display:
  - Show only member initials in the circular avatar
  - Keep click-to-remove behavior

## P2 - Medium

- Expand automation triggers beyond user actions:
  - Specific date/time trigger
  - Weekday-based trigger, e.g. `Fridays at 3:00 PM`
  - Day-of-month trigger, e.g. `1st of each month`
  - Heartbeat trigger, e.g. `every X minutes/hours`
- Add a `Labels` automation condition:
  - Place it below the existing `Lists` dropdown
  - Default option should be `Any labels`
  - Include all current labels from the active board
- Fix terminology typo in automation UI/spec: `Lables` should be `Labels`

## Recommended Implementation Order

1. Branding fix and permission validation
2. Board-level label model and admin UI
3. Card label picker/search UX
4. Member display and add-card UX cleanup
5. Automation `Labels` condition
6. Automation time/recurring triggers

## Why this order

- Permissions should be locked first so new features do not expose the wrong actions.
- Board-level labels should exist before card label UX and automation label conditions, since both depend on board-managed labels.
- Automation scheduling is more complex and can be built after the label/permission foundation is stable.
