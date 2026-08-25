# Research: Post-Beta Consistency and Drag Reliability

## Workspace/board refresh mismatch

**Decision**: Resolve selection as a pair, preserving a local workspace only if accessible and preserving a board only if it belongs to that resolved workspace. Preserve an intentional null board for a valid empty workspace during hydration.

**Rationale**: The current reducer preserves workspace and board independently. Automatic refresh then combines local Workspace2 with the server default Board1. Pair reconciliation prevents impossible state rather than hiding it in rendering.

**Alternatives Considered**: Disable auto-refresh (rejects realtime/session behavior); persist every navigation click to profile defaults (changes preference semantics and adds network coupling); filter only in `App` (leaves invalid state for other consumers).

## Date-only representation

**Decision**: Canonically store new card due dates as `YYYY-MM-DD`, parse legacy ISO input by its leading valid calendar date, and format via calendar parts rather than `new Date(dateOnly)`.

**Rationale**: HTML date inputs represent calendar dates, not instants. `new Date('YYYY-MM-DD')` is UTC and shifts to the previous day in UTC-negative zones. Existing database/API storage is text and already accepts strings, so no schema migration is required.

**Alternatives Considered**: Store local-midnight ISO (varies by editor timezone); noon UTC (reduces but does not define semantics); add timezone columns (unnecessary for date-only requirements).

## Drag insertion state

**Decision**: Calculate a normalized insertion destination from source order and collision metadata, remember the last valid destination, and render an explicit placeholder rather than relying only on reordered live nodes to imply a gap.

**Rationale**: DnD collision targets may alternate among item, source, container, or none near boundaries. `onDragOver` currently skips some of those events and thus intermittently provides no new visual gap. Explicit insertion state decouples stable UX from transient target churn and can be the sole source for final persistence.

**Alternatives Considered**: Increase CSS transition duration (does not repair missing state); restore dnd-kit DOM reparent plugin (previously caused React `removeChild` blank screens); retain only last preview array (cannot distinguish a valid same-position gap from no destination).

## Automation scope hierarchy

**Decision**: Show both workspace and board selectors within Automations, deriving workspaces from authorized automation-manageable boards plus manageable empty workspace scope.

**Rationale**: The board belongs to a workspace and both are necessary context. Board Admins must still reach their authorized board even without Workspace Admin permission.

**Alternatives Considered**: Reuse Boards-tab hidden selection (current usability bug); combine names into one selector (weak hierarchy and poor empty-workspace behavior); broaden workspace permissions (security regression).

## Admin audit heap exhaustion

**Decision**: Request only the newest 25 audit events in SQLite, cap the repository limit to 100, and add a descending timestamp index.

**Rationale**: Production retained 403,638 audit events. `listAuditEvents(db).slice(0, 25)` materialized all rows in `better-sqlite3` before JavaScript sliced the array, causing V8 heap OOM and two container restarts. A direct bounded query returned 25 rows without mutating history; the index removes the remaining full scan and sort.

**Alternatives Considered**: Delete old events (destructive and unauthorized); increase Node heap (delays failure and can exceed the pod limit); paginate the entire Admin API in this patch (larger product/API scope than the current 25-event UI requires).

## API and persistence impact

**Decision**: Preserve all endpoint and response shapes. Add only the audit ordering index; validate client canonicalization and server round-trip with existing card update/duplicate routes.

**Rationale**: The original four defects are client state/semantics/interaction problems. The production OOM requires a bounded server query; an additive index is non-destructive and avoids changing audit data or API contracts.
