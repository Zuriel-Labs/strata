# Data Model: Scalable Label Management

## PlatformSettings

Singleton platform policy.

| Field | Rule |
|---|---|
| id | Exactly 1 |
| maxLabelsPerBoard | Integer from 1 through 100; default 12 |
| updatedAt | Server-generated UTC timestamp |

### Invariants

- Startup creates the singleton idempotently.
- Missing or invalid state resolves to and is repaired as 12.
- Only a System Administrator may change the value.
- A policy change never rewrites Board label collections.

## BoardLabelCollection

Existing Board-owned definitions plus a concurrency revision.

| Field | Rule |
|---|---|
| boardId | Existing Board identity |
| labels | Ordered array of zero to 100 validated definitions |
| labelsRevision | Non-negative integer incremented once per accepted replacement |

### Invariants

- Definition IDs are unique within the collection.
- An accepted replacement supplies the current revision and increments it atomically.
- A stale revision changes nothing.
- Removing a definition retains existing transactional cleanup of card and automation references.
- A definition with an existing ID is an edit; an identity absent from current state is an addition.

### Limit state transitions

- below limit → at/below limit: edits, removals, and additions are allowed.
- below limit → above limit: rejected.
- at limit → same identities: edits/removals are allowed.
- at limit → any new identity: rejected.
- above limit → same/subset identities: edits/removals are allowed.
- above limit → any new identity: rejected.

## LabelDefinition

| Field | Rule |
|---|---|
| id | Stable collision-resistant non-empty identity, maximum 100 characters |
| name | Trimmed optional display name, maximum 50 characters |
| color | Lowercase six-digit hexadecimal color |

Identity does not derive from name, color, position, or client lifetime.

## LabelDraft

Client-only staged collection.

| Field | Rule |
|---|---|
| definitions | Independent cloned definitions |
| expectedRevision | Revision observed when editing began |
| effectiveLimit | Current hydrated platform policy |
| status | editing, saving, failed, or conflicted |

### State transitions

- editing → saving: explicit Save with a non-conflicted draft.
- saving → editing: recoverable non-conflict failure.
- saving → conflicted: server reports stale revision; blind retry is blocked.
- conflicted → editing: administrator explicitly reloads/reviews authoritative definitions.
- any non-saving state → closed: explicit Cancel/close according to existing semantics.

## AuditEvent

Relevant actions:

- board.labels.update: existing Board-scoped success event for accepted definition replacement.
- platform.label_policy.update: platform-scoped success event containing safe previous and new integer values and over-limit Board count.
- Existing forbidden-mutation audit pattern applies to unauthorized policy attempts.

No label names, card content, session identifiers, or private infrastructure details are added to audit metadata.
