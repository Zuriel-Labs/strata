# Data Model: Kanban Productivity Suite

## Card

Existing fields remain unchanged. The API gains:

| Field | Type | Rules |
|---|---|---|
| `descriptionDocument` | `RichTextDocument` | Canonical formatted description returned for every card; derived from legacy text when the stored JSON column is null. |

Database addition:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `cards.description_json` | nullable `TEXT` | `NULL` | Serialized, validated rich-text document. Null denotes a legacy row whose document is derived from `description`. |

The existing `description TEXT NOT NULL` remains a deterministic plain-text projection used by older binaries, search, and rollback. Saving either legacy `description` or `descriptionDocument` updates both representations.

## RichTextDocument

```ts
interface RichTextDocument {
  type: 'doc';
  content?: RichTextNode[];
}
```

`RichTextNode` is a discriminated tree. Only the approved node and mark types in `research.md` are accepted. Unknown keys are stripped or rejected by strict schemas. Links permit only `http:`, `https:`, and `mailto:`; client rendering adds safe external-link attributes. Limits apply to encoded bytes, node count, tree depth, and total text.

### State transitions

```text
legacy text row
  -> read: derive a paragraph document in memory
  -> save rich text: persist validated JSON + plain projection

formatted row
  -> edit: Tiptap loads JSON
  -> save: validate client-side, validate server-side, atomically update JSON + projection
  -> cancel/failure: stored document remains unchanged
```

## Active Card Order

Within each non-archived list, every active card has a unique compact logical order `0..n-1`. Archived cards are excluded from drag/sort compaction and retain no user-visible ordering guarantee.

### Move transition

1. Load card and destination list.
2. Reject if absent, archived destination, or destination board differs.
3. Remove card from the source active sequence.
4. Insert at the clamped destination index.
5. Rewrite affected source/destination active positions in one transaction.
6. Commit, audit, then run one `card_moved` automation event.

For a same-list move, source and destination are one sequence and the card is inserted exactly once.

### Sort transition

1. Load active cards in current position order.
2. Stable-sort titles with the fixed natural collator and direction.
3. Break collation ties by old position and then ID.
4. Rewrite compact positions in one transaction.
5. Audit once. Sorting does not emit card-moved automations.

## Card Duplicate

A duplicate is a new active card immediately after the source card in the same list.

| Copied | Reset/excluded | Regenerated |
|---|---|---|
| Title with ` (copy)` suffix, rich/plain description, members, valid labels, checklist text/completion state, due date and its current completion boolean, attachment metadata/link target | Card ID, comments, activity, watching, archive state, prior due-date activity/history, created-at, automation history | Card ID, checklist IDs, checklist-item IDs, attachment IDs, created-at |

The base insert and list reindex occur in one transaction. Exactly one `card_created` automation is invoked after commit. The route returns the final card state after automation.

## Board Labels

`Board.labels` remains the aggregate list of `{ id, name, color }` definitions. Names are trimmed; IDs are unique; colors must match the existing supported palette/hex validation. Deleting a definition removes that ID from all card assignments and label-based automation references in the same transaction.

The modal maintains two distinct pieces of state:

- persisted board definitions from application state;
- a draft definition list visible only in the label manager.

Save promotes the draft after server confirmation. Cancel closes the draft without changing the card or board.

## Audit Events

| Action | Scope | Metadata |
|---|---|---|
| `card.move` | board | card ID, source list, destination list, destination position |
| `list.sort` | board | list ID, direction, card count |
| `card.duplicate` | board | source card ID, duplicate card ID |
| `board.labels.update` | board | existing action retained; counts only, no sensitive description content |
| `card.update` | board | existing/new update action records changed field names, never rich-text contents |

## Migration and Rollback

- Startup inspects `PRAGMA table_info(cards)` and adds `description_json` only when absent.
- Re-running startup is a no-op.
- Malformed stored JSON is treated as legacy/plain text and never rendered as HTML.
- Rolling application source back is safe: the older version ignores the additive column and reads the synchronized `description` projection.
- The column is not dropped during rollback; removal would be destructive and is unnecessary.
