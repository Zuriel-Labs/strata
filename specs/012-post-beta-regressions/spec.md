# Feature Specification: Post-Beta Consistency and Drag Reliability

**Feature Branch**: `fix/post-beta-regressions`
**Feature ID**: `012-post-beta-regressions`
**Created**: 2026-08-25
**Status**: Specified
**Input**: Fix GitHub Issues #23–#26 after production promotion of the approved Kanban Productivity Suite.

## Scope Traceability

| Story | Issue | Outcome |
|---|---|---|
| US1 | #24 | Workspace and board selections remain a valid pair across refreshes |
| US2 | #23 | Date-only due dates render as the same calendar date everywhere |
| US3 | #25 | Card and lane drags always expose one stable destination gap |
| US4 | #26 | Automation management includes explicit Workspace and Board selectors |

## User Scenarios & Testing

### User Story 1 - Keep workspace context isolated (Priority: P1)

As a user with multiple workspaces, I can select a workspace with no boards and keep its empty state through background refreshes, so content from another workspace never appears under the wrong heading.

**Why this priority**: A mismatched workspace/board pair presents incorrect scope and undermines trust in workspace separation.

**Independent Test**: Select an empty workspace, wait through automatic and visibility refreshes, explicitly refresh the session, then confirm the board remains null until a board in that workspace is created or selected.

**Acceptance Scenarios**:

1. **Given** Workspace2 has no boards, **When** it is selected, **Then** `currentBoardId` becomes null and the empty-board view is shown.
2. **Given** the empty workspace is selected, **When** session data refreshes, **Then** Workspace2 remains selected and no Workspace1 board appears.
3. **Given** a workspace has boards, **When** it is selected, **Then** only a board belonging to that workspace may become current.
4. **Given** stored defaults are missing or mismatched, **When** the session starts, **Then** Strata resolves a valid workspace/board pair or a null board without cross-workspace display.
5. **Given** the current board or workspace is deleted, **When** authoritative state returns, **Then** all dependent selection and active-card state is reconciled safely.

---

### User Story 2 - See one due date everywhere (Priority: P1)

As a card editor, I can select a calendar due date and see that exact date on the card, in the modal, table, calendar, filters, and automations regardless of timezone.

**Why this priority**: A one-day shift changes the meaning of a deadline.

**Independent Test**: Save August 27 in UTC-negative, UTC, and UTC-positive browser timezones, refresh, and confirm every surface still represents August 27.

**Acceptance Scenarios**:

1. **Given** August 27 is selected, **When** the modal closes, **Then** the board badge reads Aug 27.
2. **Given** the same stored card is rendered in different timezones, **When** any date-only surface is opened, **Then** the calendar day remains unchanged.
3. **Given** a legacy ISO due-date value, **When** it is displayed or edited, **Then** it remains readable and normalizes without silently changing the intended date.
4. **Given** a due date is filtered or automated, **When** the local calendar crosses day boundaries, **Then** the intended due-date day controls the result.

---

### User Story 3 - Always understand drag destinations (Priority: P1)

As a board editor, I always see a stable gap for the exact card or lane destination before dropping, so rapid pointer or touch movement remains predictable.

**Why this priority**: Intermittent visual feedback makes the core ordering interaction ambiguous even when persistence succeeds.

**Independent Test**: Repeatedly cross first/middle/end boundaries for cards and lanes at different speeds, pause over source/container boundaries, drop and cancel, and compare every visible gap with persisted order.

**Acceptance Scenarios**:

1. **Given** a valid card destination, **When** the pointer enters it, **Then** exactly one card-sized insertion gap remains visible until a different valid destination is chosen or drag ends.
2. **Given** a valid lane destination, **When** the pointer enters it, **Then** exactly one lane-width insertion gap remains visible horizontally.
3. **Given** collision detection briefly reports the source, a container, or no target, **When** the drag remains active, **Then** the last valid insertion location stays visible rather than flickering away.
4. **Given** a drop succeeds, **When** the board refreshes, **Then** the persisted order exactly matches the final preview.
5. **Given** cancellation or a failed save, **When** drag ends, **Then** the preview clears and the exact original order is restored.
6. **Given** reduced motion is enabled, **When** an item is dragged, **Then** the insertion location remains unambiguous without motion dependence.

---

### User Story 4 - Choose automation workspace in context (Priority: P2)

As an authorized administrator, I can choose both Workspace and Board directly in Automations, so I do not navigate through Boards merely to change automation scope.

**Why this priority**: The current implicit workspace coupling is inefficient and can make similarly named boards ambiguous.

**Independent Test**: Open Automations, switch among manageable workspaces with zero, one, and multiple boards, and confirm selector options, rules, forms, permissions, and empty states always match.

**Acceptance Scenarios**:

1. **Given** multiple manageable workspaces, **When** Automations opens, **Then** labeled Workspace and Board selectors appear together.
2. **Given** Workspace changes, **When** its board options load from current state, **Then** the board selection becomes a valid board in that workspace or null.
3. **Given** the selected workspace has no manageable boards, **When** it is chosen, **Then** a clear empty state appears and rule controls do not target another workspace.
4. **Given** a Board Admin who cannot manage its workspace, **When** Automations opens, **Then** the board's workspace remains selectable for that authorized board without exposing other boards.
5. **Given** a direct unauthorized API request, **When** it targets an automation rule, **Then** existing server RBAC still denies it.

### Edge Cases

- The only workspace has no boards.
- A selected board is deleted during automatic refresh.
- A card stores `YYYY-MM-DD`, midnight-UTC ISO, or ISO with an explicit offset.
- Due-date display runs near daylight-saving transitions and month/year boundaries.
- A drag crosses an empty list, scroll container, source item, overlay, and last item rapidly.
- Filters hide cards between visible insertion anchors.
- A workspace has manageable scope but no automation-manageable boards; a Board Admin can manage only one board in an otherwise unmanaged workspace.
- A workspace/board is deleted while the management dialog is open.

## Requirements

### Functional Requirements

- **FR-001**: The current board MUST be null or belong to the current workspace.
- **FR-002**: Selecting a workspace MUST atomically reconcile the current board and clear board-dependent filters.
- **FR-003**: Session hydration MUST preserve an intentional null board for a still-valid selected workspace.
- **FR-004**: Session hydration MUST reject a preserved or default board that does not belong to the resolved workspace.
- **FR-005**: Initial session defaults MUST resolve only when both workspace and board exist, are accessible, and match.
- **FR-006**: Deletion and refresh MUST clear invalid active-card and management scope state.
- **FR-007**: Card due dates MUST have explicit date-only semantics.
- **FR-008**: Date-only parsing and formatting MUST be centralized and timezone-stable.
- **FR-009**: Modal, board, table, calendar, filters, and due-date automation MUST use the same date-only semantics.
- **FR-010**: Existing valid due-date values MUST remain readable without destructive migration.
- **FR-011**: Saving and duplicating a card MUST preserve the intended calendar date.
- **FR-012**: Invalid due-date strings MUST fail safely without a misleading shifted date.
- **FR-013**: Active card and lane drags MUST maintain an explicit insertion-preview state.
- **FR-014**: The preview MUST retain the last valid destination across transient invalid collision events.
- **FR-015**: Card and lane previews MUST show exactly one destination gap.
- **FR-016**: Preview projection MUST always begin from the committed drag-start order.
- **FR-017**: Final persistence MUST derive from the same insertion state shown to the user.
- **FR-018**: Empty, first, middle, last, same-position, cross-list, and filtered-card destinations MUST be deterministic.
- **FR-019**: Drag cancellation and persistence failure MUST restore exact original state.
- **FR-020**: Pointer and touch MUST provide equivalent preview behavior.
- **FR-021**: Reduced-motion users MUST receive an equally clear non-motion insertion indicator.
- **FR-022**: Read-only users MUST not begin or persist reorder operations.
- **FR-023**: Automations MUST show explicit labeled Workspace and Board controls.
- **FR-024**: Automation workspace options MUST include only workspaces containing at least one board the user can manage for automations or a workspace the user can manage.
- **FR-025**: Automation board options MUST be restricted to the selected workspace and existing automation RBAC.
- **FR-026**: Changing automation workspace MUST reconcile board and rule/form context immediately.
- **FR-027**: The panel MUST show truthful empty states for no manageable workspace and no manageable board.
- **FR-028**: Workspace/board selectors MUST remain usable at 375px, 768px, and 1280px.
- **FR-029**: Existing server authorization, validation, audit, and safe error responses MUST remain unchanged or stronger.
- **FR-030**: All four Issues MUST have focused regression tests that fail before implementation and pass afterward.

### Key Entities

- **Navigation Selection**: Current workspace, nullable current board, and dependent active/filter state with a validity invariant.
- **Card Due Date**: A nullable date-only calendar value whose meaning is independent of an instant or timezone.
- **Drag Insertion Preview**: Active item, source order, last valid destination group/index, input type, and preview order.
- **Automation Scope**: Selected manageable workspace and a nullable manageable board within it.

## Non-Goals

- Adding card due times or user-configurable timezone settings.
- Cross-workspace automation rules or new automation permissions.
- Keyboard drag-and-drop.
- Server schema changes unless investigation proves existing due-date storage cannot support safe compatibility.
- Production promotion of the new fixes before a new exact canary candidate is approved.

## Success Criteria

- **SC-001**: Zero cross-workspace board renders across automatic, visibility, explicit, mutation-triggered, and initial session hydration tests.
- **SC-002**: One selected date produces one calendar day in three representative timezone classes and every date surface.
- **SC-003**: 100 consecutive deterministic card and lane boundary projections retain exactly one valid gap and match final order in automated tests.
- **SC-004**: An authorized user changes automation workspace and board without leaving the Automations tab in at most two selections.
- **SC-005**: Full CI and live canary acceptance pass with no page errors, blank screens, new warning events, or production changes.
