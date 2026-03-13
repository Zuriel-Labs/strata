# Feature Specification: Server-Backed Auth and RBAC

**Feature Branch**: `001-auth-rbac-backend`  
**Created**: 2026-03-13  
**Status**: Draft  
**Input**: User description: "Add a SQLite-backed backend with session auth, RBAC, admin-managed password reset, user CRUD, memberships, and audit logging for Strata"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in to a real server-backed workspace (Priority: P1)

As a Strata user, I can sign in with an email address and password against the server so that access to workspaces, boards, and application data no longer depends on browser-seeded local state.

**Why this priority**: Server-backed authentication is the foundation for every other access-control and admin capability.

**Independent Test**: Can be fully tested by signing in with a seeded system administrator account, restoring a server session after reload, and verifying unauthenticated users cannot reach protected application views or APIs.

**Acceptance Scenarios**:

1. **Given** a seeded active user with valid credentials, **When** the user signs in, **Then** the system creates a server session and returns only the workspaces and boards the user is allowed to access.
2. **Given** an unauthenticated browser session, **When** the user attempts to load protected application data, **Then** the system denies access and presents the sign-in flow instead of board content.
3. **Given** a signed-in user refreshes the browser, **When** the application reloads, **Then** the existing server session restores the authenticated user and their authorized workspace context.

---

### User Story 2 - Admin manages users, roles, and memberships (Priority: P2)

As a system administrator, I can create users, assign platform and scoped roles, manage workspace membership, and trigger password resets so that Strata can be operated as a real multi-user platform.

**Why this priority**: Once sign-in is real, operators need a secure way to manage people and permissions without editing seed data.

**Independent Test**: Can be fully tested by signing in as the seeded system administrator, creating a new user, assigning roles and workspace access, triggering a password reset, and confirming the resulting audit entries and access changes.

**Acceptance Scenarios**:

1. **Given** a signed-in system administrator, **When** they create a user and assign workspace membership, **Then** the new user appears in the admin area and can access only the assigned scope.
2. **Given** a signed-in system administrator, **When** they assign or remove a role, **Then** the permission change takes effect on subsequent protected API requests without editing client state manually.
3. **Given** a signed-in system administrator, **When** they trigger a password reset, **Then** the system issues a temporary password or forced-change state and records the action in the audit log.

---

### User Story 3 - Role enforcement protects boards and administration flows (Priority: P3)

As a workspace administrator, board administrator, member, observer, or guest, I only see and perform actions that match my assigned permissions so that collaboration boundaries are enforced consistently in the UI and the API.

**Why this priority**: Fine-grained authorization is the core platform behavior that turns the app from a prototype into a real multi-tenant collaboration product.

**Independent Test**: Can be fully tested by signing in as users with different scoped roles and verifying allowed and denied actions across admin screens, workspace selection, board navigation, and protected mutations.

**Acceptance Scenarios**:

1. **Given** a workspace administrator without system administration rights, **When** they open administration features, **Then** they can manage users and boards only inside their assigned workspaces and cannot access platform-wide controls.
2. **Given** a board administrator, **When** they manage board-level settings or membership, **Then** they can update only the boards where they hold board administrator access.
3. **Given** a member, observer, or guest, **When** they attempt an action outside their permission level, **Then** the API rejects the action and the UI presents a clear access-denied state.

---

### Edge Cases

- What happens when a user signs in with an incorrect password, an inactive account, or a temporary password that requires immediate rotation?
- How does the system handle a role-scoped user attempting to access a workspace or board that is no longer assigned to them after an admin change?
- What happens when the last remaining `system_admin` attempts to remove their own platform access?
- How does the system respond when a password reset is triggered for a user who is already in a forced-password-change state?
- What happens when a session is presented after the underlying user account has been deactivated or deleted?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a server-side API backed by persistent SQLite storage for authentication, users, roles, memberships, boards, lists, cards, notifications, automation rules, and audit events.
- **FR-002**: The system MUST seed an initial `system_admin` bootstrap account and enough sample workspace and board data for first-run access without relying on browser local storage.
- **FR-003**: The system MUST authenticate users with email and password using salted password hashing and server-managed session authentication.
- **FR-004**: The system MUST require authenticated sessions for protected application data and protected mutations.
- **FR-005**: The system MUST support the role model `system_admin`, `workspace_admin`, `board_admin`, `member`, `observer`, and `guest`.
- **FR-006**: The system MUST enforce authorization on every protected API endpoint using platform, workspace, and board scope rules rather than client-side checks alone.
- **FR-007**: The system MUST return only the workspaces, boards, and related data the current user is authorized to access.
- **FR-008**: The system MUST provide a current-session endpoint that restores authenticated state after browser reload.
- **FR-009**: The system MUST provide sign-in, sign-out, password-change, and admin-triggered password-reset flows.
- **FR-010**: The system MUST require users marked for password rotation to set a new password before entering the main application.
- **FR-011**: The system MUST provide a system-admin management area for user creation, user updates, activation state, role assignment, workspace membership assignment, and password reset actions.
- **FR-012**: The system MUST prevent non-system-admin users from accessing platform-wide user CRUD and platform-wide role management.
- **FR-013**: The system MUST allow workspace administrators to manage users and board oversight only within workspaces where they hold `workspace_admin` access.
- **FR-014**: The system MUST allow board administrators to manage board settings and board membership only within boards where they hold `board_admin` access.
- **FR-015**: The system MUST prevent users from removing the final remaining `system_admin` assignment.
- **FR-016**: The system MUST record audit events for sign-in success, sign-in failure, sign-out, password changes, password resets, user CRUD, and role or membership changes.
- **FR-017**: The system MUST present clear access-denied and unauthenticated states in the frontend for rejected server actions.
- **FR-018**: The system MUST preserve existing primary board interactions for authorized users while sourcing state from the server instead of browser-seeded local data.
- **FR-019**: The system MUST include automated tests that cover authentication, authorization, password reset, admin user management, and role-scoped access rules.
- **FR-020**: The system MUST run the auth and RBAC test suite in GitHub Actions so regressions are checked on every push and pull request.

### Key Entities *(include if feature involves data)*

- **UserAccount**: A person who can sign in to Strata, with identity attributes, password state, activation state, and platform-level role information.
- **Session**: A server-managed authenticated browser session linked to a user account and expiration metadata.
- **WorkspaceMembership**: A scoped relationship between a user and a workspace that grants a workspace role.
- **BoardMembership**: A scoped relationship between a user and a board that grants a board role or guest access.
- **PasswordResetState**: Temporary password and forced-password-change state attached to a user account after an admin reset.
- **AuditEvent**: A timestamped security or administration event that records actor, action, scope, and outcome.
- **WorkspaceSnapshot**: Authorized workspace, board, list, card, notification, and automation data returned to the signed-in client.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A seeded `system_admin` can sign in from a fresh environment and reach the protected application shell in under 2 minutes without modifying source files.
- **SC-002**: 100% of tested protected endpoints reject unauthorized requests from users outside the required scope.
- **SC-003**: A system administrator can create a user, assign workspace access, trigger a password reset, and verify the resulting audit record in one end-to-end flow without database edits.
- **SC-004**: Authorized users retain access to at least one existing workspace and board flow after the migration from local storage to server-backed state.
- **SC-005**: Automated auth and RBAC coverage in CI passes with at least 80% coverage across the new backend authorization and authentication modules.
