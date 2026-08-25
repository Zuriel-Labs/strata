# Feature Specification: Board Member Card Collaboration

**Feature Branch**: `feat/board-member-permissions`
**Created**: 2026-08-25
**Status**: Approved for implementation
**Issue**: [#30](https://github.com/Broville/strata/issues/30)
**Input**: Allow non-admin Board Members to collaborate on cards while keeping swimlane and Board administration separate; allow Board Admins and higher to delete comments and edit existing automations.

## Clarifications

- “Member” means an active account with the `member` membership role on the target Board. `observer` remains read-only.
- “Add/Remove Members” means assigning or unassigning eligible Board Members on a card; it does not grant authority to change Board membership.
- Existing label assignment and shared label-definition management remain separate: Members may assign existing labels, while Board Admins and higher manage label definitions.
- Board Admin and higher means an explicit Board Admin, an inherited Workspace Admin for the Board's Workspace, or a System Admin.
- Comment authors may edit only their own comments. Board Admins and higher may delete any comment in scope, but do not gain authority to rewrite another author's comment.

## User Scenarios & Testing

### User Story 1 - Member maintains cards (Priority: P1)

As a non-admin Board Member, I can create, move, duplicate, and maintain cards on Boards where I am a Member so that I can participate in daily work without administrative access.

**Why this priority**: Card collaboration is the core workflow currently blocked for ordinary Members.

**Independent Test**: Sign in as a Member on one Board, complete each supported card action, refresh, and confirm persistence while Board and swimlane administration remains unavailable.

**Acceptance Scenarios**:

1. **Given** a Member on Board A, **When** they create a card, edit its title or rich-text description, and duplicate it, **Then** each operation succeeds and the resulting card state persists after refresh.
2. **Given** a Member on Board A, **When** they drag a card within a swimlane or to another active swimlane on Board A, **Then** the card order and destination persist.
3. **Given** a Member on Board A, **When** they add or remove a due date, toggle completion, add or remove an attachment, assign or unassign an existing label, update checklists, or toggle watched state, **Then** the change succeeds and persists.
4. **Given** a Member on Board A, **When** they assign a card member, **Then** only active accounts with the Member role on Board A are available and accepted.
5. **Given** that same Member, **When** they attempt to drag, create, rename, sort, archive, restore, or delete a swimlane, delete or archive a card, manage label definitions, manage Board settings, or manage automations, **Then** the action is unavailable and direct mutation attempts are denied without changing data.

---

### User Story 2 - Member owns comment edits (Priority: P1)

As a Board Member, I can add comments and correct my own comments without being able to impersonate another author, rewrite another person's words, or remove discussion history.

**Why this priority**: Comment authorship is a security and trust boundary once Members can edit cards.

**Independent Test**: Sign in as two Members on one Board, create comments as each user, and prove that each can edit only their own comment and neither can delete comments.

**Acceptance Scenarios**:

1. **Given** a Member on Board A, **When** they add a non-empty comment, **Then** the signed-in account is recorded as author and the comment persists.
2. **Given** a comment authored by that Member, **When** the author edits it, **Then** the text changes while author identity and original creation time remain unchanged.
3. **Given** a comment authored by another account, **When** the Member attempts to edit it, **Then** the request is denied and the original comment is unchanged.
4. **Given** any comment on Board A, **When** a non-admin Member attempts to delete it or submit a fabricated author identity, **Then** the request is denied or rejected and no comment changes.

---

### User Story 3 - Administrator moderates comments (Priority: P2)

As a Board Admin or higher, I can delete comments on Boards I manage so that inappropriate or obsolete discussion can be moderated without granting platform-wide access.

**Why this priority**: Moderation is necessary, but Member collaboration must work independently of it.

**Independent Test**: Delete a comment as each supported administrator type in scope, then attempt the same operation as a scoped administrator outside their scope.

**Acceptance Scenarios**:

1. **Given** a Board Admin, inherited Workspace Admin, or System Admin managing Board A, **When** they delete any comment on a Board A card, **Then** the comment is removed, the remaining order is preserved, and the action is audited.
2. **Given** an administrator without authority over Board B, **When** they attempt to delete a Board B comment, **Then** the request is denied and no data changes.

---

### User Story 4 - Administrator edits an automation (Priority: P2)

As a Board Admin or higher, I can open an existing automation, change its complete configuration, and save it on a Board I manage.

**Why this priority**: Existing automations can currently be enabled, disabled, or deleted, but cannot be fully corrected without replacement.

**Independent Test**: Open an existing rule, change its name, trigger, conditions, action, and enabled state, save, refresh, and confirm the exact updated rule.

**Acceptance Scenarios**:

1. **Given** an existing automation on a managed Board, **When** an authorized administrator selects Edit, changes valid fields, and saves, **Then** the updated rule replaces the previous configuration and persists.
2. **Given** invalid or incomplete edited configuration, **When** Save is attempted, **Then** an actionable error is shown and the existing rule remains unchanged.
3. **Given** a scoped administrator outside the automation's Board, **When** they attempt an update directly, **Then** the request is denied and no data changes.

### Edge Cases

- A user can be an administrator without Board membership and can be a Member without administrative grants; each capability is evaluated independently.
- An Observer may view accessible cards but cannot invoke any Member mutation.
- Revoked, inactive, observer-role, duplicate, cross-Board, and unknown users cannot be assigned to a card.
- A card cannot move to a swimlane on another Board or to an archived swimlane.
- Empty or whitespace-only comments and edits are rejected; missing comments return not found without leaking other Board data.
- Repeated comment deletion returns not found and does not duplicate audit evidence.
- Failed optimistic UI mutations restore authoritative state and surface an actionable message.
- Editing an automation cannot change its Board scope.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST grant supported card collaboration capabilities only to active `member`-role accounts on the target Board and to administrators who manage that Board.
- **FR-002**: A permitted collaborator MUST be able to create, edit, duplicate, and drag cards within and between active swimlanes on the same Board.
- **FR-003**: A permitted collaborator MUST be able to update card title, rich-text description, due date, due-date completion, attachments, existing-label assignments, checklists, eligible card-member assignments, and watched state.
- **FR-004**: Card-member assignment MUST accept only unique, active, `member`-role accounts on the card's Board.
- **FR-005**: Member collaboration MUST NOT grant swimlane creation, rename, reordering, sorting, archive, restore, or deletion; card archive or deletion; shared-label definition management; Board settings; automation management; Workspace administration; or platform administration.
- **FR-006**: Observer-role and out-of-scope accounts MUST remain unable to mutate cards.
- **FR-007**: A permitted collaborator MUST be able to add a non-empty comment whose author is derived from the authenticated account.
- **FR-008**: A comment author MUST be able to edit only their own comment while preserving comment identity, author identity, and creation time.
- **FR-009**: Only a Board Admin, inherited Workspace Admin, or System Admin managing the target Board MUST be able to delete a comment.
- **FR-010**: Generic card updates MUST NOT permit clients to replace comment history or activity history and bypass ownership or audit rules.
- **FR-011**: Authorized administrators MUST be able to open and edit every supported field of an existing automation without changing its Board scope.
- **FR-012**: Comment mutations and automation edits MUST validate input, scope, and resource existence before persistence and return safe, intentional errors.
- **FR-013**: Successful comment add, edit, and delete operations and automation edits MUST retain attributable audit evidence with Board scope.
- **FR-014**: The client MUST show Member card controls and author-specific comment controls while keeping administrative and observer controls hidden or disabled consistently with server authorization.
- **FR-015**: Failed optimistic card, comment, or automation updates MUST restore authoritative state and present an actionable error.
- **FR-016**: Existing Board administration, archive behavior, label-definition management, authentication, and authorization behavior MUST remain compatible.

### Non-Goals

- Changing Board membership or administrative grants from the card modal.
- Granting Members any swimlane, archive, Board, Workspace, or platform administration.
- Adding per-user watch storage or changing the existing watched-state model.
- Allowing administrators to edit comments authored by someone else.
- Adding new automation trigger or action types.

### Key Entities

- **Board Membership**: The collaboration relationship between an account and Board, including `member` or `observer` role.
- **Administrative Grant**: Explicit Board authority, inherited Workspace authority, or System authority; independent from membership.
- **Card**: Work item whose supported collaboration fields may be maintained by Members.
- **Comment**: Immutable-identity discussion entry with author, text, and creation time; text is editable only by its author and deletion is administrative.
- **Automation Rule**: Board-scoped configuration editable by administrators within their managed scope.
- **Audit Event**: Attributable record of a state-changing action and its Board scope.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All listed Member card workflows complete successfully on an in-scope Board and persist after refresh, with zero unintended swimlane or Board-administration capabilities exposed.
- **SC-002**: The automated role matrix proves allowed and denied behavior for Member, Observer, out-of-scope user, Board Admin, Workspace Admin, and System Admin with no unauthorized data mutation.
- **SC-003**: Comment tests prove 100% of author-spoofing, cross-author edit, and Member deletion attempts are rejected while own-comment add/edit and administrator deletion succeed.
- **SC-004**: An authorized administrator can edit and persist every supported field of an existing automation in one edit flow, while invalid edits preserve the prior rule.
- **SC-005**: Repository-native typecheck, lint, unit/integration, build, end-to-end, and full CI gates pass for the release candidate.
