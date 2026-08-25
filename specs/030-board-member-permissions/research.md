# Research: Board Member Card Collaboration

## Existing authorization topology

**Decision**: Extend the existing `canEditBoardCards` capability to exact `member` Board memberships while keeping `canManageBoard`, archive, shared-label, list, and automation capabilities administrative.

**Rationale**: Strata already models System Admin, inherited Workspace Admin, explicit Board Admin, Board Member, and Observer separately. A capability function preserves that separation and lets client and server consume the same product distinction without changing persisted roles.

**Alternatives Considered**:

- Treat every Board membership as editable: rejected because `observer` is intentionally read-only.
- Promote Members to Board Admin: rejected because access and membership are independent domain concepts.
- Add a new persisted role: rejected because the requested behavior maps cleanly to the existing `member` role.

## Card versus swimlane controls

**Decision**: Use `canEditBoardCards` only for card creation, card movement, supported card fields, and duplication. Continue to use `canManageBoard` for list title edits, list movement, list sorting, list lifecycle, card archive/delete, and Board settings.

**Rationale**: The current Board UI reuses one card-edit capability for some list controls. Broadening it without separating those controls would accidentally grant structural administration.

**Alternatives Considered**:

- Let Members sort an entire swimlane because it changes cards: rejected because sorting is a lane-level bulk action not listed in Member capabilities.

## Comment mutation boundary

**Decision**: Replace client comment-array writes with dedicated add, edit, and delete operations that return the authoritative Card. Remove `comments` and `activity` from the generic card update boundary.

**Rationale**: Whole-array replacement lets a client spoof authors, rewrite another user's comment, delete history, or alter activity. Dedicated operations can derive the author from the session, preserve immutable fields, enforce own-edit/admin-delete rules, and audit mutations.

**Alternatives Considered**:

- Diff the submitted comment array in generic card updates: rejected because concurrency, ordering, spoofing, and partial-failure behavior become ambiguous and harder to validate.
- Store comments in a new table: deferred because the current JSON storage can safely support atomic comment operations without a schema migration; a table migration is unnecessary for this scope.

## Eligible card assignees

**Decision**: Filter and validate card assignees to active `member` memberships on the same Board. Expose only those membership Board IDs in the existing scoped user summary field used by assignment selectors.

**Rationale**: The current validation accepts observers because it checks only for any Board membership. The request specifically says Members of the same Board.

## Automation editing

**Decision**: Reuse the existing validated automation form for both create and edit modes, prefill it from the selected rule, submit a full supported update, and apply only the server response to state.

**Rationale**: The server already supports scoped partial updates and validates the merged rule. A shared form prevents create/edit validation drift and avoids new dependencies.

**Alternatives Considered**:

- Allow only name or enabled-state edits: rejected because “edit existing Automations” implies the complete existing configuration.
- Delete and recreate rules: rejected because it changes identity, audit semantics, and scheduling history unnecessarily.

## Failure and concurrency behavior

**Decision**: Comment operations and automation saves use server-returned authoritative state; controls are locked during submission; failures leave or restore the previous state and display an error.

**Rationale**: This matches Strata's failure-honest UI constitution and avoids silent divergence during the five-second session refresh cycle.
