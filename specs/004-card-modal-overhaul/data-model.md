# Data Model: Card Modal Overhaul

## Existing Entity: Card

The feature reuses the existing `Card` entity with no schema changes.

### Relevant Fields

| Field | Type | Purpose |
|------|------|---------|
| `id` | string | Stable card identity |
| `title` | string | Inline-editable card title |
| `listId` | string | Current list used by the top-bar dropdown |
| `memberIds` | string[] | Drives Members section visibility and membership-watch sync |
| `labelIds` | string[] | Drives Labels section visibility |
| `dueDate` | string \| null | Drives Due Date section visibility |
| `description` | string | Always-visible body section |
| `attachments` | Attachment[] | Drives Attachments section visibility |
| `comments` | Comment[] | Always-visible Comments section |
| `activity` | ActivityEntry[] | Existing secondary detail content inside the comments/activity area |
| `watching` | boolean | Watch state for the active session user |

## Derived UI State: Card Modal Session

This feature introduces modal-local state only; it is not persisted to storage.

| Field | Type | Purpose |
|------|------|---------|
| `isTitleEditing` | boolean | Tracks whether the title is in inline edit mode |
| `draftTitle` | string | Holds the in-progress title edit |
| `revealedSections` | set-like local state | Tracks optional sections revealed during the current modal session |

## Visibility Rules

- `Description` and `Comments` are always visible.
- `Members` is visible when `memberIds.length > 0` or the section is manually revealed.
- `Labels` is visible when `labelIds.length > 0` or the section is manually revealed.
- `Due Date` is visible when `dueDate` exists or the section is manually revealed.
- `Attachments` is visible when `attachments.length > 0` or the section is manually revealed.
- Checklist data may remain on the card record for compatibility, but the modal does not surface it.

## State Transitions

### Watch / Membership
1. Card opens with current `watching` value.
2. If `currentUserId` is added to `memberIds`, set `watching = true`.
3. If `currentUserId` is removed from `memberIds`, set `watching = false`.
4. Manual watch toggles continue to directly update `watching`.

### Inline Title Editing
1. Default state shows title text.
2. Clicking the title enters edit mode and seeds `draftTitle`.
3. Pressing Enter or blurring the input commits a trimmed non-empty value.
4. Empty submissions fall back to the prior saved title.
