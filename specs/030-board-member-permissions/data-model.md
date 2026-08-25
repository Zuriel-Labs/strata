# Data Model: Board Member Card Collaboration

No schema migration is required. Existing persisted entities gain stricter mutation invariants.

## BoardMembership

| Field | Rule |
|---|---|
| `userId` | References an active account for collaboration mutations |
| `boardId` | Must equal the target Card's Board for card assignment and Member editing |
| `role` | `member` grants card collaboration; `observer` remains read-only |

### Invariants

- Membership does not imply administrative authority.
- Card assignees are unique active accounts with `role = member` on the Card's Board.

## Card

Existing collaborative fields: title, rich-text description document, list/position, member IDs, label IDs, checklists, due date, due-date completion, attachments, watched state.

### Invariants

- A Member may change collaborative fields only on a Board where they have active Member membership.
- Destination list must be active and belong to the same Board.
- Label IDs must belong to the same Board; label definitions remain administrative.
- Archive state and deletion remain administrative.
- Generic client updates cannot replace `comments` or `activity`.

## Comment

| Field | Mutability | Rule |
|---|---|---|
| `id` | Immutable | Server-generated unique identity |
| `userId` | Immutable | Derived from authenticated actor on creation |
| `text` | Author-editable | Trimmed, 1–10,000 characters |
| `createdAt` | Immutable | Server-generated creation timestamp |

### State transitions

- `absent -> active`: Member or managing administrator adds a comment as self.
- `active -> active`: Original author edits text; immutable fields remain unchanged.
- `active -> deleted`: Managing Board/Workspace/System administrator deletes it.
- Repeated delete: not found, no mutation or duplicate success audit.

## AutomationRule

Existing fields remain unchanged. The edit operation may change name, trigger, trigger configuration, conditions, action, action configuration, and enabled state.

### Invariants

- `boardId` and rule identity are immutable during edit.
- Referenced lists, labels, and Member accounts belong to the same Board.
- Schedule configuration remains valid for the selected trigger.
- Failed validation leaves the stored rule unchanged.

## AuditEvent

New/confirmed actions:

- `card.comment.create`
- `card.comment.update`
- `card.comment.delete`
- `automation.update` (existing action retained)

Each event records authenticated actor, Board scope, success outcome for committed mutations, and target identifiers in safe metadata where useful.
