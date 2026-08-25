# Feature Specification: Kanban Productivity Suite

**Feature Branch**: `feat/kanban-productivity-suite`
**Feature ID**: `011-kanban-productivity-suite`
**Created**: 2026-08-24
**Status**: Implemented — local validation complete; canary delivery in progress
**Input**: Complete every open Strata Issue (#15, #16, #17, #18, and #19), validate each task with explicit acceptance criteria, and deliver one combined candidate to Strata Canary without changing production.

## Scope Traceability

| User Story | GitHub Issue | Outcome |
|------------|--------------|---------|
| US1 | #15 | Modern exact-position card reordering within and between swimlanes |
| US2 | #19 | Rich-text card descriptions with faithful multiline view mode |
| US3 | #18 | Complete board-label management from inside a card |
| US4 | #17 | Atomic card duplication with defined copy semantics |
| US5 | #16 | Persisted A-to-Z and Z-to-A swimlane sorting |

## User Scenarios & Testing

### User Story 1 - Arrange cards naturally within swimlanes (Priority: P1)

As an authorized board administrator, I can drag a card to an exact position within the same swimlane or another swimlane and see the surrounding cards make room, so the board communicates priority as naturally as a high-quality kanban tool.

**Why this priority**: Manual priority ordering is a core board behavior, and the current append-only drop behavior prevents users from expressing order inside a swimlane.

**Independent Test**: Populate two swimlanes with multiple cards, reorder cards to the beginning, middle, end, and another swimlane using each supported input mode, refresh the session, and confirm exact persisted order and authorization behavior.

**Acceptance Scenarios**:

1. **Given** an authorized user drags a card within its swimlane, **When** the card crosses another card's insertion boundary, **Then** neighboring cards animate aside and a card-sized gap identifies the exact destination.
2. **Given** a card is dropped at the beginning, middle, end, or its original position, **When** the save completes, **Then** the visible and persisted order is exact, contiguous, and stable after refresh.
3. **Given** a card is dragged into another swimlane, **When** it is placed between two destination cards, **Then** it occupies that exact position and existing cross-swimlane behavior remains intact.
4. **Given** pointer, touch, or keyboard input, **When** a user starts, moves, drops, or cancels a reorder, **Then** the interaction is operable and communicates its state accessibly.
5. **Given** filters hide cards, **When** a visible card is reordered, **Then** hidden cards retain a deterministic relative order and no card is lost or duplicated.
6. **Given** a reorder cannot be persisted, **When** the request fails, **Then** the board restores authoritative order and displays actionable failure feedback.
7. **Given** a read-only user, **When** they interact with a card, **Then** they can open and read it but cannot begin or persist a reorder.

---

### User Story 2 - Write and read structured card descriptions (Priority: P1)

As an authorized card editor, I can write a multiline formatted description and later see the same structure in read mode, so requirements, steps, links, and technical notes remain easy to scan.

**Why this priority**: Description fidelity affects every substantive card, and existing line breaks are not reliably preserved in read mode.

**Independent Test**: Edit a legacy description and a new empty description using every supported format, save/cancel/fail the operation, reload the session, and compare the editor and read-only result across roles and viewports.

**Acceptance Scenarios**:

1. **Given** an editable card, **When** the user opens Description edit mode, **Then** the editor contains the exact saved paragraphs, blank lines, breaks, lists, links, headings, quotes, code, and inline emphasis.
2. **Given** a formatted draft, **When** Save succeeds, **Then** read mode faithfully renders the same semantic structure after modal reopen, page refresh, and sign-in restoration.
3. **Given** a changed draft, **When** Cancel is selected, **Then** no mutation occurs and the last persisted description is restored.
4. **Given** a save failure, **When** the server rejects or cannot persist the document, **Then** the draft remains recoverable and persisted content is not replaced.
5. **Given** legacy plain-text descriptions containing multiple lines or blank lines, **When** the upgraded application starts, **Then** every character and meaningful line boundary remains represented in the new description.
6. **Given** pasted or submitted unsafe content, **When** it is processed or viewed, **Then** executable markup, event handlers, and unsafe links cannot execute or remain active.
7. **Given** a read-only user, **When** they open a card, **Then** they can read formatted content but cannot enter editing or submit mutations.

---

### User Story 3 - Manage labels without leaving a card (Priority: P1)

As an authorized board-label manager, I can create, rename, recolor, and delete shared board labels from the card Labels panel while continuing to assign or remove them, so label administration stays in the context where it is most useful.

**Why this priority**: Labels are a frequent card workflow, but definition management currently requires leaving the card and using a separate board-level surface.

**Independent Test**: From one open card, create and automatically assign a label, edit it, confirm the board-wide update, delete it with confirmation, and verify permissions and persistence without closing the card.

**Acceptance Scenarios**:

1. **Given** label-management permission, **When** a user creates a named or color-only label in the card panel, **Then** it becomes a board label and is automatically assigned to the current card after success.
2. **Given** an existing label, **When** its name or color is edited and saved, **Then** every board surface reflects the updated shared definition.
3. **Given** a label used by cards or automation, **When** deletion is requested, **Then** the user receives an explicit board-wide impact confirmation before any mutation.
4. **Given** deletion is confirmed, **When** the operation succeeds, **Then** the label is removed from every card and dependent automation references follow the established cleanup behavior.
5. **Given** a card editor without label-management permission, **When** they open Labels, **Then** they can assign or remove existing allowed labels but cannot create, edit, or delete definitions.
6. **Given** any pending or failed label mutation, **When** the user interacts again, **Then** duplicate/stale submission is prevented and the interface returns to authoritative board state with clear feedback.
7. **Given** the existing board-level label manager, **When** labels are managed from either surface, **Then** both surfaces remain consistent and fully usable.

---

### User Story 4 - Duplicate a complete card predictably (Priority: P2)

As an authorized card editor, I can duplicate a card in one action, so recurring work and templates can be reused without manually recreating content.

**Why this priority**: Duplication provides significant productivity value but depends on the existing card model rather than repairing a broken core interaction.

**Independent Test**: Duplicate a fully populated card, compare every copied and reset field, verify its exact position and post-creation automation result, reload the session, and repeat under allowed and denied roles.

**Acceptance Scenarios**:

1. **Given** a fully populated active card, **When** an authorized user duplicates it, **Then** exactly one new active card is created immediately after the source with the title `<source title> (copy)`.
2. **Given** source content, **When** duplication succeeds, **Then** description, labels, members, checklist content and completion, due date and completion, and attachments are copied with independent identities.
3. **Given** source history and user-specific state, **When** duplication succeeds, **Then** comments, prior activity, watching, archived state, source identity, and source creation time are not copied.
4. **Given** creation automations, **When** a duplicate is created, **Then** those automations execute exactly once and the final returned card reflects their effects.
5. **Given** any failure during duplication, **When** the operation aborts, **Then** no partial card remains and existing card order is unchanged.
6. **Given** a successful duplicate, **When** the client receives it, **Then** the new card opens for immediate editing and success feedback is shown.
7. **Given** a read-only user, **When** they view the card, **Then** the duplicate action is unavailable and direct mutation is denied.

---

### User Story 5 - Alphabetize a swimlane on demand (Priority: P2)

As an authorized board administrator, I can sort a swimlane A to Z or Z to A from its corner menu, so I can normalize or scan a long list and then continue arranging it manually.

**Why this priority**: This is a high-value quality-of-life action built on the same persisted order model as manual rearrangement.

**Independent Test**: Sort a mixed-title swimlane in both directions under filters, refresh the session, manually reorder afterward, and verify permissions, archive-menu preservation, and failure behavior.

**Acceptance Scenarios**:

1. **Given** an authorized user opens a swimlane menu, **When** the menu renders, **Then** it presents Sort A to Z, Sort Z to A, and the existing Archive list action with destructive separation.
2. **Given** titles with case, accents, and embedded numbers, **When** ascending or descending sort is selected, **Then** the result is locale-aware, case-insensitive, numeric-aware, deterministic, and persisted.
3. **Given** active filters, **When** a sort is selected, **Then** every active card in the swimlane is included while archived cards remain untouched.
4. **Given** a completed sort, **When** the user manually reorders a card afterward, **Then** manual order becomes authoritative because sorting is a one-time action rather than a permanent mode.
5. **Given** an empty or single-card swimlane, **When** sorting is selected, **Then** the action completes as a safe no-op without side effects.
6. **Given** a sort failure, **When** persistence does not complete, **Then** authoritative order is restored and failure feedback is shown.
7. **Given** action-specific permissions, **When** the corner menu is displayed, **Then** only actions the user may perform are enabled or visible.

## Edge Cases

- A card is dropped back onto its original insertion point.
- A drag is cancelled by Escape, pointer cancellation, touch scroll, or loss of the active target.
- A filtered list contains hidden cards before, between, and after the visible insertion target.
- A destination swimlane is missing, archived, or belongs to another board.
- Two ordering operations are submitted repeatedly or with stale membership.
- Titles differ only by case, accents, numeric substrings, surrounding whitespace, or equivalent collation.
- A description is empty, contains only blank lines, is near the size limit, or contains deeply nested/unsupported data.
- Legacy descriptions contain Windows and Unix newlines, consecutive blank lines, Unicode, or angle-bracket text that is not markup.
- A user pastes formatted content containing disallowed elements, inline event handlers, or executable URL schemes.
- A label has an empty name, a duplicate client identity, an invalid color, or is deleted while referenced by cards and automation.
- Label-management and card-edit permissions differ even if current roles often grant them together.
- A duplicate source contains large file attachments, completed checklists, a completed due date, and rich text.
- A duplicate creation automation immediately changes its labels, due state, members, or swimlane.
- A request fails after optimistic client state changes but before the server confirms persistence.
- The user switches boards, closes the modal, or loses the session while a mutation is pending.

## Requirements

### Functional Requirements

#### Card ordering (Issue #15)

- **FR-001**: Authorized users MUST be able to place an active card at any exact position within its current swimlane.
- **FR-002**: Authorized users MUST be able to place an active card at any exact position in another active swimlane on the same board.
- **FR-003**: During reordering, surrounding cards MUST animate to reveal a destination gap that matches the dragged card's space.
- **FR-004**: Reordering MUST support pointer, touch, and keyboard operation, including start, movement, drop, and cancel.
- **FR-005**: Reordering MUST expose understandable state and instructions to assistive technology.
- **FR-006**: Reordering MUST preserve click-to-open behavior and avoid accidental drag activation.
- **FR-007**: The saved order MUST remain exact after refresh and session restoration.
- **FR-008**: Reordering under filters MUST preserve every hidden card and deterministic relative order.
- **FR-009**: Invalid, archived, missing, or cross-board destinations MUST be rejected without mutation.
- **FR-010**: A failed reorder MUST restore authoritative state and display actionable feedback.
- **FR-011**: Users without card-edit authority MUST NOT begin or persist a reorder.
- **FR-012**: Ordering mutations MUST leave active cards with unique contiguous positions and no partial state.

#### Rich descriptions (Issue #19)

- **FR-013**: Authorized users MUST be able to edit card descriptions as structured rich text.
- **FR-014**: The supported content set MUST include paragraphs, hard breaks, bold, italic, strikethrough, level-two and level-three headings, bullet lists, numbered lists, blockquotes, inline code, code blocks, and safe links.
- **FR-015**: The editor MUST provide undo, redo, common keyboard shortcuts, visible focus, and meaningfully named formatting controls.
- **FR-016**: Read mode MUST faithfully render saved semantic structure and multiline boundaries.
- **FR-017**: Save MUST persist one complete description revision and Cancel MUST preserve the last saved revision.
- **FR-018**: A failed Save MUST retain a recoverable draft and MUST NOT replace persisted content.
- **FR-019**: Existing plain-text descriptions MUST migrate without losing text, Unicode, blank lines, or meaningful line boundaries.
- **FR-020**: Description migration MUST be safe to run repeatedly without changing already-current data.
- **FR-021**: Malformed, oversized, unsupported, or unsafe description content MUST be rejected with a stable safe error.
- **FR-022**: Executable markup, event handlers, and unsafe URL schemes MUST NOT execute or remain active after paste, persistence, or rendering.
- **FR-023**: An empty description MUST retain the existing placeholder experience and MUST NOT appear non-empty elsewhere.
- **FR-024**: One successful save MUST create at most one description activity event.
- **FR-025**: Read-only users MUST be able to view formatted descriptions but MUST NOT edit them.

#### In-card label management (Issue #18)

- **FR-026**: The card Labels panel MUST continue to search, assign, and unassign existing labels.
- **FR-027**: Authorized label managers MUST be able to create named and color-only board labels from the card.
- **FR-028**: A newly created label MUST be automatically assigned to the current card only after board-label creation succeeds.
- **FR-029**: Authorized label managers MUST be able to rename and recolor an existing board label from the card.
- **FR-030**: Label definition edits MUST update every current board consumer consistently.
- **FR-031**: Deleting a label MUST require an explicit confirmation describing its board-wide card and automation impact.
- **FR-032**: Confirmed deletion MUST remove the label from cards and apply the established automation-reference cleanup.
- **FR-033**: Canceling a label create, edit, or delete flow MUST make no mutation.
- **FR-034**: Label assignment authority and board-label management authority MUST be enforced independently in the UI and server.
- **FR-035**: Invalid colors, malformed labels, duplicate identities, and unauthorized mutations MUST be rejected without partial state.
- **FR-036**: Pending and failed label mutations MUST prevent duplicate/stale submissions and recover to authoritative state.
- **FR-037**: Card-level and board-level label management MUST remain behaviorally consistent and accessible.

#### Card duplication (Issue #17)

- **FR-038**: Authorized users MUST be able to duplicate one active card in one action.
- **FR-039**: A duplicate MUST be created directly after the source in the same board and swimlane with the title `<source title> (copy)`.
- **FR-040**: A duplicate MUST copy description, labels, members, checklist content/completion, due date/completion, and attachments.
- **FR-041**: A duplicate and its nested checklist, checklist-item, and attachment records MUST have identities independent from the source.
- **FR-042**: A duplicate MUST NOT copy comments, prior activity, watching, archived state, source identity, or source creation time.
- **FR-043**: A duplicate MUST begin active and not watched with a fresh creation time and a source-attributed creation activity.
- **FR-044**: Card-created automation MUST execute exactly once for the duplicate, and the returned card MUST represent the final result.
- **FR-045**: Duplication MUST be all-or-nothing and leave existing positions unchanged on failure.
- **FR-046**: A successful duplicate MUST open the new card and provide success feedback; a failed duplicate MUST preserve the source and provide failure feedback.
- **FR-047**: Unauthorized users MUST NOT see or invoke duplication and direct mutation MUST be denied.
- **FR-048**: Duplication MUST produce an audit record identifying the actor, source card, new card, and board without exposing sensitive data.

#### Swimlane sorting (Issue #16)

- **FR-049**: An authorized swimlane menu MUST include Sort A to Z and Sort Z to A while preserving Archive list.
- **FR-050**: Archive list MUST be visually separated from non-destructive sorting actions and remain permission-gated independently.
- **FR-051**: Sorting MUST compare titles case-insensitively, locale-aware, numeric-aware, and deterministically for ties.
- **FR-052**: Sorting MUST include every active card in the swimlane regardless of visible filters and MUST exclude archived cards.
- **FR-053**: Sorting MUST persist one complete contiguous order that survives refresh and session restoration.
- **FR-054**: Sorting MUST be a one-time reorder and MUST NOT prevent later manual ordering.
- **FR-055**: Empty and single-card sorts MUST be safe no-ops.
- **FR-056**: Invalid order membership, unauthorized access, and failed persistence MUST produce no partial state and MUST restore authoritative client order.
- **FR-057**: Sorting MUST NOT be represented as a cross-swimlane move or trigger card-moved automation.

#### Cross-cutting delivery

- **FR-058**: Every mutation MUST validate input, enforce server-side authorization, return a stable `{ message: string }` failure, and create appropriate audit evidence.
- **FR-059**: All changed interactions MUST define pending, success, failure, empty, keyboard, responsive, light/dark theme, and reduced-motion behavior where applicable.
- **FR-060**: Existing board, card, archive, automation, filter, modal, authentication, and session workflows MUST remain functional.
- **FR-061**: The combined source MUST be delivered as one clean, reproducible, immutable canary candidate before any production change.
- **FR-062**: Production MUST remain unchanged until the user explicitly approves the exact source, image digest, and canary deployment candidate.

### Key Entities

- **Card**: A board work item with title, ordered swimlane placement, description, shared labels, members, checklists, due state, comments, activity, attachments, watch state, archive state, and creation identity.
- **Card Order**: The unique contiguous sequence of active cards within one swimlane.
- **Rich Description Document**: A validated tree of allowed text blocks, inline marks, links, and line boundaries plus a backward-compatible plain-text representation.
- **Board Label**: A shared board-scoped definition with identity, optional name, and color; cards and automation refer to its identity.
- **Duplicate Card Operation**: An atomic creation derived from a source card with explicit copied, regenerated, and reset fields.
- **Swimlane Sort Operation**: A one-time deterministic reorder of every active card in one swimlane.
- **Release Candidate**: The exact combination of source tree, immutable image digest, and canary deployment configuration commit presented for approval.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In acceptance testing, beginning, middle, end, same-position, and cross-swimlane card placements are correct after refresh for pointer, touch, and keyboard paths with zero lost or duplicated cards.
- **SC-002**: Every supported description block/mark round-trips through Save, modal reopen, page refresh, and session restoration with exact semantic structure, and 100% of tested legacy multiline descriptions retain their text and line boundaries after two application starts.
- **SC-003**: From one open card, an authorized label manager completes create-and-assign, rename, recolor, and confirmed delete without leaving the modal, and every tested board surface reflects the same definition after refresh.
- **SC-004**: A fully populated duplicated card matches 100% of the specified copied/reset field contract, has independent nested identities, occupies the exact next position, and leaves zero partial records under injected failure.
- **SC-005**: A-to-Z and Z-to-A sorting produces the expected deterministic order for the complete mixed-title test set, survives refresh, excludes archived cards, and permits subsequent manual reordering.
- **SC-006**: The allowed/denied role matrix passes for every new UI control and direct mutation path with zero unauthorized state changes.
- **SC-007**: All focused tests and the repository's typecheck, lint, unit/integration, build, E2E, and full CI commands pass on the exact candidate source.
- **SC-008**: The immutable candidate reaches `strata-canary` with ArgoCD Synced/Healthy, ready workloads, healthy `/api/health`, successful authentication and changed user journeys, no new warning events or application errors, and no production Strata change.
