# Research: Kanban Productivity Suite

## Decision 1: Current dnd-kit React API for sortable cards

**Decision**: Use `@dnd-kit/react` with `@dnd-kit/helpers`, `DragDropProvider`, and `useSortable`. Model each list as a sortable group, use pointer and keyboard sensors, render a drag overlay, update the local list order during drag-over, and restore the snapshot on cancellation or failed persistence.

**Rationale**: The current dnd-kit API supports React 19, built-in sensors, sortable operations, collision-aware multi-list patterns, and drag overlays without relying on HTML5 drag-and-drop. Its official multiple-sortable-lists guide directly covers kanban/Trello-style interaction and optimistic rollback.

**Alternatives considered**:

- Native HTML drag events: already present but cannot provide high-quality keyboard behavior, consistent overlay/gap animation, or reliable touch behavior.
- Legacy `@dnd-kit/core` + `@dnd-kit/sortable`: supported, but the newer API removes `SortableContext`, centralizes sensors, and is the documented forward path.
- A bespoke pointer system: rejected because it duplicates accessibility, collision, cancellation, and sensor work.

**Primary references**:

- https://dndkit.com/react/quickstart/
- https://dndkit.com/react/guides/migration/
- https://dndkit.com/react/guides/multiple-sortable-lists/
- https://dndkit.com/react/components/drag-overlay/

## Decision 2: Tiptap document editing with constrained structured storage

**Decision**: Use Tiptap 3 with StarterKit and Link for editing. Store validated ProseMirror JSON in `description_json`; return it as `descriptionDocument`; derive and retain a plain-text `description`. Render from structured nodes to React elements, not from arbitrary HTML.

**Rationale**: Tiptap's React integration is compatible with React 19, its document JSON is portable and testable, and the extension model allows the product to expose only the requested formatting. Structured storage avoids scriptable HTML and preserves list/paragraph semantics across edit/view cycles.

**Supported schema**:

- Nodes: `doc`, `paragraph`, `text`, `heading` levels 2–3, `bulletList`, `orderedList`, `listItem`, `blockquote`, `codeBlock`, `hardBreak`, `horizontalRule`.
- Marks: `bold`, `italic`, `strike`, `code`, `link` with `http`, `https`, or `mailto` targets.
- Limits: at most 100,000 serialized bytes, 5,000 nodes, depth 12, and 50,000 text characters.

**Alternatives considered**:

- Store sanitized HTML: simpler rendering but introduces a second parser/sanitizer security boundary and weaker schema guarantees.
- Markdown: safe and portable but does not meet the requested direct rich-text editing experience.
- `contenteditable` without an editor framework: rejected due to selection, paste normalization, accessibility, and browser consistency risks.

**Primary references**:

- https://tiptap.dev/docs/editor/getting-started/install/react
- https://tiptap.dev/docs/editor/extensions/functionality/starterkit
- https://tiptap.dev/docs/editor/extensions/marks/link
- https://tiptap.dev/docs/guides/output-json-html

## Decision 3: Additive rich-text migration with a compatibility projection

**Decision**: Add nullable `cards.description_json TEXT` at startup when absent. Existing rows are represented as paragraphs derived from `description`; a rich-text save writes both JSON and a deterministic plain-text projection. The migration is idempotent and does not rewrite every row at startup.

**Rationale**: Existing databases can upgrade without table replacement, long locks, or data loss. A prior application image ignores the additive column and still reads current plain text, which makes source rollback operationally safe.

**Alternatives considered**:

- Replace `description` with JSON: breaks rollback and all existing readers.
- Store JSON only for newly edited cards without fallback conversion: makes behavior inconsistent and complicates clients.
- Eagerly rewrite all existing rows: unnecessary write amplification; fallback conversion is deterministic.

For API compatibility, callers may submit either legacy `description` or structured `descriptionDocument`, but not both in the same request. Supplying both is rejected as ambiguous. A structured save is canonical and always refreshes the plain-text projection.

## Decision 4: Server-authoritative deterministic sort

**Decision**: Add `POST /api/lists/{listId}/sort` with `{ direction: "asc" | "desc" }`. Sort active cards on the server using `Intl.Collator('en-US', { sensitivity: 'base', numeric: true })`, then current position and ID as stable tie breakers, and compact positions in one transaction.

**Rationale**: Every client gets the same persisted order, no ordered-ID payload can smuggle cards across a board boundary, and the request is constant-size.

**Alternatives considered**:

- Sort only in the browser: does not persist and can disagree by client locale.
- Submit the ordered card IDs: larger attack surface and payload; the server would still need to validate completeness and membership.
- Store a permanent sort mode: not requested; manual reorder after sorting must remain possible.

## Decision 5: Transactional move and duplication repository operations

**Decision**: Move multi-row position updates and duplication into named repository functions wrapped by `better-sqlite3` transactions. Verify same-board source/destination membership before mutation. Execute real-time automation only once after a duplicate or move transaction commits.

**Rationale**: Route-level loops currently expose partially updated orders if a statement fails. Repository transactions keep invariants local, testable, and all-or-nothing.

**Alternatives considered**:

- Keep route-level updates: rejected because it cannot guarantee atomicity.
- Fractional positions: avoids compaction but introduces precision/rebalancing complexity outside the current integer model.
- Run automation inside the transaction: rejected because automation can perform additional mutations and should only observe committed base state.

## Decision 6: Reuse the board-label aggregate contract

**Decision**: Extract a reusable `LabelEditor` and keep `PUT /api/boards/{boardId}/labels` as the single board-label write. The card modal stages definitions locally; Save persists the complete definition set; Cancel discards it. Existing repository cleanup removes deleted IDs from cards and automation rules transactionally.

**Rationale**: It preserves one permission and data-integrity path, avoids divergent in-card/manager behavior, and meets create/edit/delete requirements without multiplying endpoints.

**Alternatives considered**:

- Individual label CRUD endpoints: useful at larger scale but unnecessary for the current small board aggregate and would duplicate cleanup logic.
- Save on every keystroke: poor failure behavior and makes Cancel impossible.

## Decision 7: Canary identity and validation

**Decision**: Build the clean committed feature branch to an immutable image tag, record its digest, update only the canary Helm value through Gitea, wait for ArgoCD health, create a dedicated canary test login, and execute the acceptance matrix in the deployed UI. Keep the GitHub PR unmerged and production unchanged.

**Rationale**: This produces a uniquely identifiable candidate that the user can approve as a whole and allows exact rollback to the previous canary image.
