# Feature Specification: Strata Board Workflow Hardening

**Feature Branch**: `001-harden-board-workflows`  
**Created**: 2026-03-14  
**Status**: Draft  
**Input**: User description: "Todo: @strata-prioritized-backlog.md Acceptance criterias: @strata-acceptance-criteria.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Protect board administration and fix product branding (Priority: P1)

As an administrator, I can see Strata branding everywhere and only see board administration controls when my role allows it, so the product feels consistent and members are not exposed to actions they cannot perform.

**Why this priority**: Incorrect branding and overly visible admin actions create immediate trust, security, and usability issues across the app.

**Independent Test**: Can be fully tested by signing in as system admin, workspace admin, board admin, and member, then verifying branding, automation controls, and archive or unarchive actions in the UI and through direct API requests.

**Acceptance Scenarios**:

1. **Given** a user opens any app page, **When** the page finishes loading, **Then** the browser tab title and all user-facing product text show `Strata` and never `FlowBoard`.
2. **Given** a system admin, workspace admin, or board admin has access to a board, **When** they open that board, **Then** they can see and use automation controls that fall within their allowed scope.
3. **Given** a regular member opens a board, **When** they view board and card actions, **Then** they do not see archive, unarchive, create automation, edit automation, enable automation, or disable automation controls.
4. **Given** an unauthorized user sends an archive, unarchive, or automation mutation request directly, **When** the server evaluates the request, **Then** the request is rejected and no data changes occur.

---

### User Story 2 - Manage board labels and simplified card interactions (Priority: P2)

As a board administrator or member working inside a board, I can manage board-specific labels and assign them through simple card interactions, so labels stay relevant to the board and common card actions require less effort.

**Why this priority**: Board-scoped label management unlocks the requested label picker, keeps boards independent, and improves the highest-frequency card workflows.

**Independent Test**: Can be fully tested by creating and editing labels on one board, refreshing the app, assigning and removing labels on cards, creating cards with the streamlined input, and removing card members without affecting other boards.

**Acceptance Scenarios**:

1. **Given** a board admin opens a board, **When** they use the board-level `Labels` control, **Then** they can create, edit, and delete labels for only that board and those changes persist after refresh.
2. **Given** a user opens a card in a board with labels, **When** they open the card `Labels` picker and search by name, **Then** they see only labels for the active board and can add an allowed label with one click.
3. **Given** a card already has an applied label, **When** an authorized user clicks that applied label on the card, **Then** the label is removed immediately.
4. **Given** a user clicks `Add a card`, **When** the title input appears and they press `Enter` with non-empty text, **Then** the card is created in the current list without extra add or cancel buttons.
5. **Given** assigned members are shown on a card, **When** the card renders, **Then** each assigned member is shown as a circular avatar with initials only while the existing click-to-remove behavior stays available to authorized users.

---

### User Story 3 - Configure richer label-aware automation schedules (Priority: P3)

As a board administrator, I can filter automations by labels and schedule them using calendar or recurring triggers, so board workflows can run without manual actions.

**Why this priority**: Automation expansion is valuable once permissions and board-managed labels are reliable.

**Independent Test**: Can be fully tested by creating automations with each new trigger type and a label condition, refreshing the page, and validating that the stored automation still targets the expected board labels and schedule.

**Acceptance Scenarios**:

1. **Given** a board admin configures automation conditions, **When** they open the conditions UI, **Then** a `Labels` dropdown appears below `Lists`, defaults to `Any labels`, and includes the current board labels.
2. **Given** a board admin creates a date or time trigger, weekday trigger, monthly trigger, or heartbeat trigger, **When** they save the automation, **Then** the schedule persists after refresh and is shown with the correct configuration.
3. **Given** an automation uses a selected label condition, **When** the automation executes, **Then** it evaluates against the selected board label and not labels from other boards.
4. **Given** users view automation-related text, **When** labels are referenced in the UI, **Then** the term `Labels` is used consistently instead of `Lables`.
5. **Given** a scheduled automation is saved with list or label conditions, **When** its schedule fires, **Then** the action runs against only the non-archived cards on the active board that match those saved conditions.

---

### Edge Cases

- A board admin deletes a label that is currently assigned to cards or referenced by an automation.
- A board has no custom labels beyond the defaults and a user opens the label picker or automation label condition.
- A user presses `Enter` on an empty or whitespace-only card title.
- An automation schedule is configured with an invalid interval, invalid day-of-month, or a past one-time run.
- A workspace admin has authority in one workspace but not another and attempts cross-workspace board operations.
- Archived boards or cards are viewed by members who should not see restore controls.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST replace all user-facing `FlowBoard` branding with `Strata`, including browser tab titles and visible UI text across authentication, workspace, board, card, settings, and automation views.
- **FR-002**: The system MUST show automation viewing and management controls only to system admins, workspace admins within their workspace scope, and board admins within their board scope.
- **FR-003**: The system MUST reject unauthorized automation create, update, delete, enable, and disable requests on the server.
- **FR-004**: The system MUST show board and card archive or unarchive actions only to system admins, workspace admins within their workspace scope, and board admins within their board scope.
- **FR-005**: The system MUST reject unauthorized board and card archive or unarchive requests on the server.
- **FR-006**: The system MUST preserve the existing RBAC model so system admins keep full access, workspace admins keep full access within administered workspaces, board admins keep full access within administered boards, and members keep only their existing allowed member-level card actions.
- **FR-007**: The system MUST provide a board-level `Labels` management control in the board view for board admins and higher.
- **FR-008**: The system MUST allow authorized users to create, edit, and delete labels scoped only to the active board.
- **FR-009**: The system MUST ensure each board starts with three default labels that remain editable and removable.
- **FR-010**: The system MUST keep a visible `Labels` action on every card that opens a searchable picker listing all labels for the active board.
- **FR-011**: The system MUST allow authorized users to add a board label to a card from the picker and remove an applied label by clicking it on the card.
- **FR-012**: The system MUST simplify card creation so `Add a card` opens a title-only input, submits on `Enter`, rejects empty or whitespace-only titles, and does not require redundant add or cancel buttons.
- **FR-013**: The system MUST display assigned card members as circular initials-only avatars while preserving existing authorized removal behavior.
- **FR-014**: The system MUST add a `Labels` automation condition below the existing `Lists` condition, default it to `Any labels`, and populate it from the active board's current labels.
- **FR-015**: The system MUST support automation schedule types for specific date and time, weekday and time, day-of-month and time, and recurring heartbeat intervals in minutes or hours.
- **FR-016**: The system MUST validate and persist automation list and label conditions plus schedule settings so they remain accurate after refresh and execute against the configured board scope.
- **FR-017**: The system MUST apply scheduled automation actions only to non-archived cards on the active board that satisfy the saved list and label conditions.
- **FR-017**: The system MUST use the term `Labels` for all user-visible label terminology in automation and related UI.
- **FR-018**: The system MUST use the term `Labels` for all user-visible label terminology in automation and related UI.
- **FR-019**: The system MUST keep all new and updated board, card, label, and automation interactions responsive and usable on desktop and mobile viewports.

### Key Entities *(include if feature involves data)*

- **Board Label**: A board-scoped label definition with a name, visual presentation, board ownership, and lifecycle rules for creation, update, and removal.
- **Card Label Assignment**: A relationship between a card and a board label that controls which labels are visibly applied to a card.
- **Automation Schedule**: A board automation timing definition supporting one-time, weekday-based, monthly, and recurring interval execution.
- **Automation Conditions**: Board automation filters that scope execution to matching list and label combinations within the active board.
- **Permission Scope**: The effective administrative scope for a signed-in user across system, workspace, board, and member roles.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In role-based validation, 100% of tested member sessions fail to see or invoke restricted automation and archive or unarchive actions, while authorized admin sessions complete the same actions successfully within their allowed scope.
- **SC-002**: In branding verification across the primary app routes, 0 user-facing occurrences of `FlowBoard` remain.
- **SC-003**: In board-label validation, administrators can create, edit, and delete labels on one board without changing the labels available on any other tested board.
- **SC-004**: In card workflow testing on desktop and mobile viewports, users complete card creation, label assignment or removal, and member removal in no more than one interaction step after opening the relevant control.
- **SC-005**: In automation validation, each new trigger type and the label condition can be saved, reloaded, and executed or evaluated according to its configured board-specific schedule or label selection.
