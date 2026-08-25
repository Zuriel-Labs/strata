# Feature Specification: Layered Administration and Board-Rooted Membership

**Feature Branch**: `fix/post-beta-regressions`
**Created**: 2026-08-25
**Status**: Implemented; exact-candidate validation pending
**Issue**: [#29](https://github.com/Broville/strata/issues/29)

## Problem Statement

Strata currently represents administrative authority and collaboration membership in the same assignments. This prevents mixed scoped administration, incorrectly makes access depend on membership, and cannot safely delegate account/member administration to Workspace and Board Administrators.

Strata needs four independent concepts: System Administration, Workspace Administration, Board Administration, and Board Membership. Workspace collaboration membership must be derived only from board membership.

## Definitions

- **System Administrator**: a global platform authority with effective administration over every workspace and board.
- **Workspace Administrator grant**: explicit authority over one workspace and all boards it contains.
- **Board Administrator grant**: explicit authority over one board.
- **Board membership**: collaboration access to one board at Member or Observer level.
- **Derived workspace membership**: the fact that a user belongs to at least one board in a workspace.
- **Effective Board Administrator**: a System Administrator, an explicit Board Administrator, or a Workspace Administrator for the board's parent workspace.
- **Explicit grant**: an assignment stored directly for a user and resource.
- **Inherited authority**: effective authority received from a broader scope without an additional explicit grant.

## Clarifications

### 2026-08-25

- Administrative authority and collaboration membership are independent and may coexist in any combination.
- Board membership is the only assignable collaboration membership; workspace membership is derived.
- System Administrators alone create accounts and assign administrative grants.
- Scoped administrators manage board membership within their effective scope but cannot create accounts or assign administrative grants.
- System Administrators may retain explicit scoped grants even though those grants are redundant while global authority is active.

## User Scenarios & Testing

### User Story 1 — Assign mixed administrative authority (Priority: P1)

A System Administrator creates or edits an account and independently assigns global, workspace, and board administrative authority without creating collaboration membership.

**Independent Test**: Create a user with two Workspace Administrator grants, two explicit Board Administrator grants in other workspaces, and no board memberships. Confirm the grants are retained, effective administration is correct, and the user is absent from all board member choices.

**Acceptance Scenarios**:

1. **Given** a regular account, **when** a System Administrator grants two workspaces and three boards, **then** all five explicit grants are retained independently.
2. **Given** a System Administrator with explicit scoped grants, **when** global authority is active, **then** all resources are manageable while the explicit grants remain visible as redundant assignments.
3. **Given** an administrator with no board membership, **when** board member or card assignment choices load, **then** the administrator is not included solely because of administrative authority.
4. **Given** a Workspace Administrator grant, **when** a board is later created in that workspace, **then** effective Board Administrator authority applies without a new explicit grant.

### User Story 2 — Manage collaboration membership within scope (Priority: P1)

A Workspace or Board Administrator searches existing Strata accounts and manages board membership only within resources they administer.

**Independent Test**: Sign in as a Board Administrator who is not a board member, add an existing regular user as a Member to that board, confirm derived workspace membership, then attempt an out-of-scope change and receive a denial.

**Acceptance Scenarios**:

1. **Given** a Board Administrator, **when** they search eligible users for their board, **then** existing members are excluded from add results.
2. **Given** a Board Administrator, **when** they add an existing account as Member or Observer, **then** only that board membership changes.
3. **Given** a Workspace Administrator, **when** they manage any board under that workspace, **then** membership changes succeed even if the administrator is not a board member.
4. **Given** a scoped administrator, **when** they target an out-of-scope board or try to assign administrative access, **then** the request is rejected without partial writes.
5. **Given** a user whose final board membership in a workspace is removed, **when** their session refreshes, **then** derived workspace membership disappears.

### User Story 3 — Scale account and resource selection (Priority: P1)

An administrator manages large directories without loading or rendering every account, workspace, or board at once.

**Independent Test**: With more records than one page, search users and resources, page through deterministic results, retain off-page selections, and save the full assignment set.

**Acceptance Scenarios**:

1. **Given** more users than the page limit, **when** an administrator opens People, **then** only one bounded page loads with a total count and deterministic navigation.
2. **Given** a resource search, **when** the administrator filters by workspace or text, **then** bounded matching results show workspace-qualified board names.
3. **Given** selected resources that no longer match the active filter, **when** the filter changes, **then** selections remain represented in the summary and saved payload.
4. **Given** a keyboard-only user, **when** they search, select, remove, page, and save assignments, **then** every action is reachable with visible focus and meaningful labels.

### User Story 4 — Preserve and migrate existing authorization (Priority: P1)

An existing Strata installation upgrades without losing users, collaboration access, administrative authority, or historical evidence.

**Independent Test**: Create a legacy database, run startup twice, and confirm legacy administrators retain effective authority, legacy board administrators remain collaborators, all records remain, and the second run is a no-op.

**Acceptance Scenarios**:

1. **Given** a legacy Workspace Administrator membership, **when** migration runs, **then** an equivalent Workspace Administrator grant exists.
2. **Given** a legacy Board Administrator membership, **when** migration runs, **then** an equivalent Board Administrator grant and collaboration membership remain.
3. **Given** legacy workspace Member rows, **when** migration completes, **then** they no longer grant access independent of board membership.
4. **Given** an already migrated database, **when** startup runs again, **then** no duplicate grants or membership changes occur.

### User Story 5 — Revoke authority immediately and audibly (Priority: P1)

An administrator changes roles, grants, active state, or membership and expects the new boundary to apply immediately with audit evidence.

**Independent Test**: Revoke a logged-in user's Board Administrator grant, verify all sessions are invalidated, the next request is unauthorized for that action, and one scoped audit change is recorded without secrets.

**Acceptance Scenarios**:

1. **Given** an active session, **when** any authorization or membership assignment changes, **then** all target sessions are invalidated.
2. **Given** a failed mixed-assignment request, **when** validation or authorization rejects it, **then** no assignments change and a safe failure is returned.
3. **Given** a successful change, **when** audit history is inspected, **then** actor, target, scope, outcome, and non-secret before/after identifiers are present.

## Edge Cases

- A System Administrator has redundant explicit scoped grants.
- A user is Workspace Administrator in one workspace and explicit Board Administrator in another.
- A user administers a board without membership in that board or its workspace.
- A board moves between workspaces; explicit Board Administrator grants remain attached to the board while inherited authority follows the new parent.
- A board/workspace is deleted while grants exist.
- A user has both Observer and administrative authority for the same board.
- Search text contains mixed case, surrounding whitespace, or no matches.
- A selected assignment falls outside the current page or filter.
- Two administrators update the same account from stale views.
- The last active System Administrator is targeted for demotion, deactivation, or deletion.
- A scoped administrator targets themselves for membership change.
- A member is removed from one of several boards in the same workspace.
- Legacy data contains duplicate-equivalent or orphaned role rows.

## Functional Requirements

### Authorization model

- **FR-001**: The system MUST represent platform role, Workspace Administrator grants, Board Administrator grants, and Board memberships as independent assignments.
- **FR-002**: A user MUST be able to hold any number of Workspace Administrator and Board Administrator grants simultaneously.
- **FR-003**: System Administrator authority MUST apply globally without requiring scoped grants.
- **FR-004**: Workspace Administrator authority MUST apply to every current and future board in the granted workspace.
- **FR-005**: Board Administrator authority MUST apply only to the explicitly granted board unless broader authority independently applies.
- **FR-006**: Administrative authority MUST NOT create or remove Board membership, card membership, or watch state.
- **FR-007**: Board membership MUST support Member and Observer collaboration levels and MUST NOT encode administrative authority.
- **FR-008**: Workspace membership MUST be derived from at least one Board membership in the workspace and MUST NOT be directly assignable.
- **FR-009**: Effective permissions MUST be calculated from global authority, parent-scope grants, resource grants, and Board membership without using legacy direct workspace membership.
- **FR-010**: Explicit scoped grants MUST be retained while a user is System Administrator.

### Delegated administration

- **FR-011**: System Administrators MUST be able to create, edit, deactivate, recover, and delete accounts subject to last-admin safeguards.
- **FR-012**: System Administrators MUST be able to assign/revoke platform role, scoped admin grants, and Board memberships transactionally.
- **FR-013**: Workspace Administrators MUST be able to manage Board memberships for boards in their granted workspaces.
- **FR-014**: Board Administrators MUST be able to manage Board memberships only for boards they explicitly or effectively administer.
- **FR-015**: Scoped administrators MUST operate only on existing system accounts.
- **FR-016**: Scoped administrators MUST NOT create accounts, change platform roles, assign/revoke admin grants, generate recovery keys, delete accounts, or access unrestricted audit history.
- **FR-017**: The server MUST reject privilege escalation and out-of-scope mutations independent of UI visibility.
- **FR-018**: Eligible add-member search MUST exclude inactive users and users already assigned to the selected board.
- **FR-019**: Membership removal MUST update derived workspace membership without changing unrelated board memberships or grants.

### Scale and interaction

- **FR-020**: User directories MUST support server-side case-insensitive search, deterministic pagination, bounded page sizes, and total-result metadata.
- **FR-021**: Workspace and Board assignment catalogs MUST support server-side search and bounded pagination.
- **FR-022**: Board results MUST include their parent workspace identity and support workspace filtering.
- **FR-023**: Assignment controls MUST preserve selected values across searches and pages.
- **FR-024**: The interface MUST distinguish explicit, inherited, and global effective authority.
- **FR-025**: The Admin panel MUST expose only actions permitted for the current administrator.
- **FR-026**: Changed Admin workflows MUST provide labeled loading, empty, no-results, validation, success, failure, and permission-denied states.
- **FR-027**: Changed controls MUST be keyboard-operable with visible focus and programmatic labels.
- **FR-028**: The Admin panel MUST remain usable at 375px, 768px, and 1280px in light and dark themes.

### Integrity, security, and lifecycle

- **FR-029**: Multi-assignment create/update operations MUST be atomic and reject unknown or duplicate resource IDs.
- **FR-030**: Authorization or membership changes MUST invalidate every active session for the target account before returning success.
- **FR-031**: Successful and denied administrative mutations MUST produce non-secret audit evidence including actor, target, affected scope, and outcome.
- **FR-032**: The final active System Administrator MUST NOT be demoted, deactivated, or deleted.
- **FR-033**: Resource/user deletion MUST cascade only corresponding scoped grants and memberships.
- **FR-034**: Startup migration MUST be idempotent and preserve existing users, collaboration, effective authority, sessions, content, and audit history.
- **FR-035**: Legacy Workspace Administrator and Board Administrator assignments MUST produce equivalent new grants.
- **FR-036**: Legacy Board Administrators MUST retain Board membership after migration.
- **FR-037**: Legacy direct workspace Member rows MUST cease granting access after migration.
- **FR-038**: API failures MUST avoid exposing password hashes, recovery material, session identifiers, or internal errors.
- **FR-039**: Concurrent/stale full-account updates MUST not silently discard assignments; the interface MUST refresh authoritative state after save and report conflicts or failures honestly.

## Key Entities

- **User Account**: identity, platform role, active state, and profile.
- **Workspace Administrator Grant**: explicit user-to-workspace administrative relationship.
- **Board Administrator Grant**: explicit user-to-board administrative relationship.
- **Board Membership**: user-to-board collaboration relationship at Member or Observer level.
- **Derived Workspace Membership**: computed set of workspaces represented by Board memberships.
- **Effective Permission Snapshot**: current global, inherited, explicit, and membership relationships delivered to an authenticated session.
- **Administrative Audit Event**: immutable evidence of an attempted or completed administrative action.

## Success Criteria

- **SC-001**: Every combination in the global/workspace/board-admin/membership matrix returns the expected allow/deny result in automated tests.
- **SC-002**: A user with mixed assignments across at least three workspaces and five boards can be created, edited, reloaded, and audited without assignment loss.
- **SC-003**: Direct workspace membership never grants access in new-session tests.
- **SC-004**: A directory of at least 250 users, 100 workspaces, and 1,000 boards returns bounded deterministic pages and does not render the entire collection initially.
- **SC-005**: Scoped administrators complete an in-scope membership change while every tested escalation and out-of-scope attempt is denied without partial writes.
- **SC-006**: A legacy database migrates twice with identical post-first-run grants, memberships, record counts, and effective permissions.
- **SC-007**: Revoked authorization is unusable on the target account's next request.
- **SC-008**: All applicable repository-native gates and live canary journeys pass with zero uncaught browser errors.

## Non-Goals

- User-defined/custom roles or permission builders.
- Groups, teams, SCIM, SSO, directory synchronization, or email invitations.
- Deny policies, conditional/time-based grants, or per-card authorization.
- Production promotion before approval of the exact canary candidate.
