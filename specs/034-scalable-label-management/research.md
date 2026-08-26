# Research: Scalable Label Management

## Decision 1: Use collision-resistant browser identities for staged definitions

**Decision**: Generate each new definition identity with crypto.randomUUID and retain server-side uniqueness validation.

**Rationale**: The reported regression comes from a page-local sequential counter that resets while prior values persist. UUID generation removes the cross-refresh/tab/device collision class without changing the existing staged aggregate editor.

**Alternatives Considered**:

- Keep the counter and scan for the next unused value: avoids immediate collisions but remains session/order dependent and fragile across concurrent devices.
- Use array index, name, or color: unstable or non-unique and unsuitable for card/automation references.
- Introduce individual server-created label endpoints: strong ownership but substantially broadens this fix; aggregate writes remain acceptable at the bounded 100-definition ceiling when protected by revisions.

## Decision 2: Store one strongly typed platform policy row

**Decision**: Add a singleton platform_settings row with max_labels_per_board and updated_at, defaulting to 12 and constrained to 1–100.

**Rationale**: A typed row makes the supported setting explicit, queryable, and validated by both application and database. It is simpler and safer than parsing arbitrary key/value JSON for the first platform policy.

**Alternatives Considered**:

- Environment variable: requires redeployment, is not System Admin-configurable, and cannot provide live policy changes.
- Browser/local storage: not authoritative and differs by account/device.
- Generic untyped key/value settings: flexible but adds parsing/error cases without current need.

## Decision 3: Preserve existing Boards when the limit is lowered

**Decision**: Treat the policy as an additive ceiling. Existing over-limit collections remain intact and permit rename/recolor/delete, while any update introducing a new identity is rejected until the current count is below the policy and the result is within it.

**Rationale**: This meets the requested configurability without destructive migration, detached card references, or a Board that cannot be cleaned up.

**Alternatives Considered**:

- Reject a lower System setting: prevents organizational policy changes and makes configuration dependent on manual cleanup first.
- Automatically delete excess definitions: destructive and semantically impossible to choose safely.
- Block every update on over-limit Boards: prevents rename/recolor/delete and traps administrators.

## Decision 4: Add optimistic concurrency to the aggregate collection

**Decision**: Add a monotonically increasing labels revision to each Board, require expectedRevision on replacement, and conditionally update within the same transaction as cleanup and audit.

**Rationale**: Complete-array replacement can otherwise overwrite an accepted edit from another administrator. A revision is small, explicit, and compatible with the current API shape.

**Alternatives Considered**:

- Last-write-wins: silently loses accepted work.
- Compare JSON payloads only: lacks a durable client precondition and can miss ABA changes.
- Per-definition CRUD endpoints: viable long-term but unnecessary for the bounded collection and larger in scope.

## Decision 5: Deliver the effective limit through authenticated app state

**Decision**: Add maxLabelsPerBoard to AppState/session payload and return current policy details from the admin mutation response.

**Rationale**: Both label managers already derive data from hydrated app state, and the existing five-second authenticated refresh propagates a changed policy without another polling loop.

**Alternatives Considered**:

- Fetch the setting separately in every label editor: duplicate requests and loading/error states.
- Put the value only in Admin directory responses: non-admin Board managers still need the effective limit.
- Hard-code 12 in the client: drifts immediately after configuration changes.

## Decision 6: Keep one shared editor and bounded row scrolling

**Decision**: Pass the effective policy into LabelEditor, keep count/error/actions outside the row scroller, and preserve its use in both Board and card contexts.

**Rationale**: The existing shared component was introduced specifically to avoid behavioral drift. Bounded row scrolling scales to 100 without expanding the modal beyond the viewport.

**Alternatives Considered**:

- Separate manager implementations: duplicates identity, accessibility, conflict, and limit logic.
- Virtualize at 12–100 rows: adds complexity and focus/measurement risk without demonstrated performance need.
- Paginate definitions: impairs editing and selection for a bounded collection.

## Decision 7: No new runtime dependency

**Decision**: Use existing Web Crypto, SQLite, Zod, React, Testing Library, Supertest, and Playwright capabilities.

**Rationale**: The platform already supplies every required primitive. Avoiding a UUID or settings library keeps the change reproducible and focused.
