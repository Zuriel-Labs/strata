# Feature Specification: Scalable Label Management

**Feature Branch**: fix/scalable-label-management
**Created**: 2026-08-26
**Status**: Approved for implementation
**Issue**: https://github.com/Broville/strata/issues/34
**Input**: Prevent sixth-label identity collisions, make label management scale reliably, set the default maximum to 12 labels per Board, and let System Administrators configure the platform-wide per-Board limit.

## Clarifications

- A label definition belongs to one Board. The platform setting controls the maximum number of definitions allowed on each Board; it is not a global shared label catalog.
- The initial and fallback limit is 12 definitions per Board. A System Administrator may set a whole-number value from 1 through 100.
- Lowering the limit never deletes or rewrites existing definitions or references. A Board already above the new limit is grandfathered: existing definitions remain editable or removable, while additions remain blocked until the Board is below the limit.
- If the configured limit is below the three standard new-Board labels, a new Board receives only as many standard definitions as the limit permits.
- Concurrent administrators must not silently overwrite one another. A stale save is rejected and the editor preserves or safely reconciles the draft against authoritative state.
- Shared definition management remains administrative. Board Members may assign existing definitions to cards but do not gain definition or System Settings authority.

## User Scenarios & Testing

### User Story 1 - Manage six or more labels without cross-editing (Priority: P1)

As a Board administrator, I can add, rename, recolor, and remove labels independently after refresh so that managing a sixth or later definition never changes another label.

**Why this priority**: The reported identity collision breaks the existing label editor and creates a risk of confusing or rejected changes.

**Independent Test**: Persist five definitions including a previously client-created identity, reload, add a sixth definition, edit its name and color, save, reload, and confirm all six definitions retain distinct identities and values.

**Acceptance Scenarios**:

1. **Given** five persisted Board labels and a fresh application load, **When** an authorized administrator adds and types into a sixth label, **Then** only the sixth label changes and every definition has a unique stable identity.
2. **Given** six or more definitions, **When** the administrator opens a color selector and chooses a color using pointer, touch, or keyboard, **Then** only the intended label changes.
3. **Given** a duplicate identity is submitted directly, **When** the server validates the request, **Then** it rejects the mutation without changing definitions, card assignments, automation references, or audit success history.
4. **Given** a save fails, **When** the editor reports the failure, **Then** the unsaved draft remains recoverable and authoritative Board state remains unchanged.

---

### User Story 2 - Work within a clear Board label limit (Priority: P1)

As an authorized label manager, I can see the effective limit and use every available slot so that label management remains predictable on desktop, phone, and tablet.

**Why this priority**: The product needs a supported scale boundary rather than an undocumented implementation ceiling.

**Independent Test**: With the default policy, create and edit 12 definitions through both label-management entry points, then confirm a thirteenth addition is unavailable in the UI and rejected by the server.

**Acceptance Scenarios**:

1. **Given** fewer than 12 definitions under the default policy, **When** an administrator adds labels, **Then** the visible count advances and every slot through 12 remains independently usable.
2. **Given** 12 definitions under the default policy, **When** the administrator views either label manager, **Then** Add is disabled with an accessible explanation while rename, recolor, delete, Save, and Cancel remain usable.
3. **Given** a direct request would add a thirteenth definition, **When** the server evaluates it, **Then** it returns an intentional limit error containing the current limit and commits no mutation.
4. **Given** a long definition collection, **When** the manager is used on desktop, phone, or tablet, **Then** definitions scroll independently while heading, feedback, and Save/Cancel remain reachable.
5. **Given** more definitions than palette colors, **When** a new definition is created, **Then** colors may repeat deterministically without sharing identity or edit state.

---

### User Story 3 - Configure the platform policy safely (Priority: P2)

As a System Administrator, I can change the maximum definitions per Board and understand the impact so that Strata can support different organizational needs without redeployment.

**Why this priority**: Configuration turns the fixed product default into an intentional, durable policy while preserving safe boundaries.

**Independent Test**: Change the limit as a System Administrator, refresh and restart the application, verify the setting persists, and prove other roles cannot change it.

**Acceptance Scenarios**:

1. **Given** a System Administrator, **When** they open System Settings, **Then** they see the effective maximum, allowed range, and number of Boards that would exceed a proposed lower value.
2. **Given** a valid whole number from 1 through 100, **When** the System Administrator saves it, **Then** the policy takes effect without restart, persists across restart, and records attributable audit evidence.
3. **Given** an invalid value or a non-System Administrator, **When** an update is attempted through the UI or directly, **Then** the request is rejected and the prior setting remains unchanged.
4. **Given** a proposed value below one or more current Board counts, **When** the System Administrator confirms it, **Then** no definition or dependent reference is deleted and affected Boards become addition-blocked rather than read-only.

---

### User Story 4 - Preserve accepted work during concurrent management (Priority: P2)

As a Board administrator, I receive a clear conflict instead of losing another administrator's accepted label changes when both edit the same Board.

**Why this priority**: The existing complete-collection save can otherwise replace newer state silently, which becomes more likely as management scales.

**Independent Test**: Open the same definitions in two sessions, save a change in the first, then attempt a stale save in the second and confirm the first change remains authoritative.

**Acceptance Scenarios**:

1. **Given** two editors opened at the same collection revision, **When** one save succeeds and the other submits stale state, **Then** the stale request receives a conflict and cannot overwrite the accepted definitions.
2. **Given** a stale conflict, **When** the client displays it, **Then** the administrator can retain or safely reconcile the draft and retry against current authoritative state.

### Edge Cases

- The effective setting row is missing, malformed, or outside the supported range during startup.
- A Board has zero definitions or is already above a newly lowered limit.
- An over-limit Board submits only rename/recolor changes, removes definitions, or attempts to add a new identity.
- A custom Board-creation payload exceeds the current limit or the limit is below the standard default-label count.
- A new definition is added after an application reload, in a second tab, or on another device.
- Two definitions share a color after the palette is exhausted.
- The active color selector's label is removed or authoritative state changes.
- A limit update races with a label update.
- A user loses administrative authority while an editor is open.
- Legacy malformed duplicate IDs are detected during migration or rollout inspection.

## Requirements

### Functional Requirements

- **FR-001**: Every newly created label definition MUST receive a collision-resistant identity that is unique within its Board and stable after persistence and refresh.
- **FR-002**: Name, color, deletion, selection, and open-editor state MUST target exactly one definition by stable identity.
- **FR-003**: Duplicate identities and malformed definitions MUST be rejected atomically without dependent-state mutation.
- **FR-004**: Failed definition saves MUST preserve authoritative data and provide a recoverable client draft with actionable feedback.
- **FR-005**: The system MUST maintain one durable platform setting for maximum label definitions per Board, defaulting to 12 and accepting whole numbers from 1 through 100.
- **FR-006**: Only System Administrators MUST be able to update the setting; the effective non-sensitive limit MUST be available to authenticated clients that render label management.
- **FR-007**: Successful setting changes MUST persist across restart, take effect without redeployment, and produce attributable platform-scoped audit evidence with safe prior/new values.
- **FR-008**: Invalid or unauthorized setting updates MUST leave the prior value unchanged and return an intentional safe error.
- **FR-009**: Every definition-creation path MUST enforce the effective limit server-side, including new-Board creation and either label-management entry point.
- **FR-010**: Lowering the setting MUST NOT delete, merge, detach, or rewrite existing definitions, card assignments, filters, or automation references.
- **FR-011**: A Board above the effective limit MUST allow non-additive rename, recolor, and delete changes while rejecting any change that introduces a new identity until the Board is below the limit.
- **FR-012**: New-Board standard definitions MUST be capped by the effective setting, and custom creation payloads above the setting MUST be rejected atomically.
- **FR-013**: Both shared label-management entry points MUST display the same authoritative definition count and effective limit.
- **FR-014**: Add MUST be disabled at or above the limit with visible and screen-reader-accessible explanation while existing definition controls remain usable.
- **FR-015**: At 6, 12, and any configured value through 100, every visible definition MUST retain independent name, color, and delete controls in a bounded responsive scrolling layout.
- **FR-016**: Color choice MUST remain independent by definition; palette reuse after exhaustion MUST be deterministic and MUST NOT imply shared identity.
- **FR-017**: Accepted definition changes MUST continue to propagate without truncation to cards, assignment pickers, filters, and automation controls.
- **FR-018**: Stale complete-collection saves MUST be detected and rejected before persistence so accepted concurrent changes cannot be silently lost.
- **FR-019**: Conflict feedback MUST retain or safely reconcile the local draft against authoritative state and permit an intentional retry.
- **FR-020**: Shared definition management MUST remain limited to managing Board/Workspace/System administrators, while Board Members retain only existing-label assignment capability.
- **FR-021**: Successful definition and setting mutations MUST preserve existing audit semantics and authorization enforcement.
- **FR-022**: Migration and startup behavior MUST create or repair the setting default idempotently without rewriting existing Board label collections.
- **FR-023**: Existing malformed duplicate IDs found during rollout MUST be reported without automatic destructive merge or deletion.

### Non-Goals

- Creating a platform-global label taxonomy shared between Boards.
- Card-private definitions, per-card label appearance overrides, label groups, hierarchy, icons, or definition reordering.
- Unlimited definition collections.
- Changing card-label assignment permissions or intentional cleanup when an administrator explicitly deletes a definition.
- Automatically deciding how ambiguous legacy duplicate identities map to cards or automations.

### Key Entities

- **Label Definition**: A Board-owned stable identity, optional display name, and color used by cards, filters, and automations.
- **Board Label Collection**: The authoritative ordered definitions for one Board plus a concurrency revision.
- **Platform Label Policy**: The durable maximum definitions allowed per Board and its supported range.
- **Label Draft**: Unsaved editor state tied to a known authoritative collection revision.
- **Audit Event**: Attributable evidence of successful definition or platform-policy mutation.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Automated and browser tests complete the reported fresh-load sixth-label journey with zero cross-row name, color, or delete mutations.
- **SC-002**: All 12 default slots are independently usable in both label managers, and 100% of limit-plus-one UI/API attempts are blocked without data mutation.
- **SC-003**: Role-matrix tests reject 100% of setting updates from non-System Administrators and definition updates from users outside existing management policy.
- **SC-004**: Lower-limit tests preserve 100% of pre-existing definitions, card references, and automation references while allowing non-additive edits.
- **SC-005**: Concurrent-save tests preserve the first accepted update in 100% of stale-write attempts and return actionable conflict feedback to the stale editor.
- **SC-006**: The setting persists across database reopen and application restart without requiring deployment or manual data repair.
- **SC-007**: Desktop, tablet, and phone acceptance checks keep every definition control and Save/Cancel reachable at 6, 12, and configured-above-12 counts.
- **SC-008**: Repository-native typecheck, lint, unit/integration, contract, build, end-to-end, and full CI gates pass for the exact release candidate.
