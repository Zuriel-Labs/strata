# Feature Specification: Core Platform Overhaul

**Feature Number**: 003
**Short Name**: core-platform
**Branch**: 003-core-platform
**Created**: 2026-03-13

---

## Overview

Transform Strata from a demo-seeded MVP into a production-ready, self-bootstrapping platform. This includes removing all demo data, switching identity from email to username, implementing first-run admin bootstrap, adding self-service password recovery via recovery keys, enforcing confirm-password on all password flows, aligning the RBAC permission matrix to the desired specification, refactoring the admin panel into sub-menus with isolated state, enabling workspace creation, and improving UX with overlay menus and touch-friendly targets.

---

## User Scenarios & Testing

### US1: Clean First Launch (P1)
**As a** new deployer,
**I want** Strata to start with an empty database and present a setup wizard,
**so that** I can create the first admin account without pre-existing demo data.

**Acceptance Scenarios:**
- **Given** a fresh database with zero users, **when** navigating to the app, **then** a bootstrap wizard is displayed (not the login screen).
- **Given** the bootstrap wizard, **when** I enter a username, password, and confirm password, **then** a system_admin account is created and I am logged in.
- **Given** an admin already exists, **when** navigating to the app, **then** the normal login screen is shown.
- **Given** any password form, **when** password and confirm password do not match, **then** an error is shown and submission is blocked.

### US2: Username-Based Identity (P1)
**As a** user,
**I want** to log in with a username instead of an email,
**so that** no email infrastructure is required.

**Acceptance Scenarios:**
- **Given** the login screen, **when** I see the identity field, **then** it is labeled "Username" (not "Email").
- **Given** registration or user creation, **when** entering identity, **then** the field accepts usernames (alphanumeric, underscores, hyphens, 3-32 chars).
- **Given** existing session/cookie flows, **when** authenticating, **then** username is used in all server responses and audit logs.

### US3: Recovery Key System (P1)
**As a** user,
**I want** to generate a recovery key from my account settings and use it to reset my password,
**so that** I can recover access without admin intervention.

**Acceptance Scenarios:**
- **Given** I am authenticated, **when** I navigate to account settings, **then** I can generate a one-time recovery key.
- **Given** a recovery key has been generated, **when** I am on the login screen and click "Forgot Password?", **then** I see a form for username + recovery key + new password + confirm password.
- **Given** a valid recovery key, **when** I submit the forgot-password form, **then** my password is updated and the recovery key is consumed (single-use).
- **Given** an invalid or already-consumed recovery key, **when** I submit the form, **then** an error is shown and no password change occurs.

### US4: Permission Matrix Alignment (P1)
**As a** platform operator,
**I want** the RBAC system to match the desired permission matrix exactly,
**so that** access control is predictable and the Guest role is removed.

**Acceptance Scenarios:**
- **Given** the RBAC system, **when** checking roles, **then** the Guest role does not exist at any level (platform, workspace, board).
- **Given** the role matrix from `desired_permissions.md`, **when** any action is attempted, **then** the permission check matches the matrix exactly:

| ACTION | SYSTEM_ADMIN | WORKSPACE_ADMIN | BOARD_ADMIN | MEMBER | OBSERVER |
|--------|-------------|----------------|-------------|--------|----------|
| View all workspaces and boards | Yes | Only assigned workspace scope | Only assigned board scope | Only assigned board scope | Only assigned board scope |
| Create users / reset passwords / manage memberships | Yes | No | No | No | No |
| Create workspace | Yes | No | No | No | No |
| Edit workspace settings | Yes | Assigned workspace | No | No | No |
| Delete workspace | Yes | Assigned workspace | No | No | No |
| Create board | Yes | In assigned workspace | No | No | No |
| Edit board settings | Yes | In assigned workspace | Assigned board | No | No |
| Delete board | Yes | Yes | Yes | No | No |
| Create cards and lists | Yes | Yes | Yes | Yes | No |
| Edit cards, comments, checklists, attachments | Yes | Yes | Yes | Yes | No |
| Delete cards | Yes | Yes | Yes | No | No |
| Edit another user's card | Yes | Yes | Yes | No | No |

### US5: Admin Panel Sub-Menus (P2)
**As a** system admin,
**I want** the admin panel to have distinct sub-menus for Edit Users, Create User, and Audit,
**so that** each view has isolated state and clear navigation.

**Acceptance Scenarios:**
- **Given** I open the admin panel, **when** viewing the navigation, **then** I see three sub-menu options: Edit Users, Create User, Audit.
- **Given** I am on the Create User view, **when** I switch to Edit Users, **then** the Create User form state is not carried over (isolated state).
- **Given** I am editing a user, **when** I switch to Create User, **then** the edit state is not leaked into the create form.

### US6: Workspace Creation (P2)
**As a** system admin or workspace admin,
**I want** to create new workspaces through the UI with server persistence,
**so that** I can organize my work dynamically.

**Acceptance Scenarios:**
- **Given** I have workspace creation permission, **when** I click "Create Workspace", **then** a form appears with name, description, and visibility fields.
- **Given** a valid form, **when** I submit, **then** the workspace is created on the server, appears in the sidebar, and is selected.
- **Given** I am a Member or Observer, **when** viewing the sidebar, **then** no "Create Workspace" option is visible.

### US7: Overlay Menus & Touch Friendly (P3)
**As a** mobile user,
**I want** side-panels to use overlay/drawer patterns with adequate touch targets,
**so that** I can use Strata comfortably on touch devices.

**Acceptance Scenarios:**
- **Given** a mobile viewport, **when** opening the sidebar or admin panel, **then** it renders as an overlay with a backdrop.
- **Given** the overlay is open, **when** I tap the backdrop or press Escape, **then** the overlay closes.
- **Given** any interactive element, **when** measuring its touch target, **then** it is at least 44x44px.
- **Given** a desktop viewport, **when** viewing panels, **then** they can remain as side panels or overlays (consistent behavior).

---

## Functional Requirements

### Identity & Auth

- **FR-001**: Remove all demo/seed users, workspaces, boards, cards, and automation rules from production startup. A dev/test seed mode controlled by environment variable `SEED_DATA=true` may optionally populate demo data.
- **FR-002**: Rename the `email` field to `username` across database schema, API contracts, server types, and frontend forms. Username format: alphanumeric + underscores + hyphens, 3-32 characters.
- **FR-003**: Implement a first-run bootstrap wizard that activates when zero users exist in the database. The wizard collects username, password, and confirm password, then creates a system_admin account.
- **FR-004**: Add a server endpoint `GET /api/auth/needs-bootstrap` that returns `{ needsBootstrap: boolean }`.
- **FR-005**: Add confirm-password validation to all password-setting flows: bootstrap, account settings password change, recovery, and admin password reset.

### Recovery

- **FR-006**: Add a `recovery_keys` table: `userId`, `keyHash` (bcrypt), `createdAt`, `consumedAt`.
- **FR-007**: Implement `POST /api/auth/recovery-key/generate` — generates a random recovery key, hashes and stores it, returns the plaintext key once. Replaces any existing unused key for that user.
- **FR-008**: Implement `POST /api/auth/recovery-key/consume` — accepts `{ username, recoveryKey, newPassword, confirmPassword }`, validates and consumes the key, updates the user's password.
- **FR-009**: Add a "Forgot Password?" link on the login screen that shows the recovery form.
- **FR-010**: Add a "Generate Recovery Key" button in the authenticated user's account/settings area.

### RBAC

- **FR-011**: Remove the `guest` role from workspace_memberships and board_memberships role enums. Migration removes existing guest memberships.
- **FR-012**: Update all permission evaluators to match the desired_permissions.md matrix exactly.
- **FR-013**: Ensure workspace-scoped actions (create board, edit/delete workspace settings) check workspace membership role correctly — workspace_admin for their assigned workspace only.
- **FR-014**: Ensure board-scoped actions (edit board settings, delete board, edit other users' cards) check board membership role correctly.
- **FR-015**: Only system_admin can create users, reset passwords, manage memberships, create workspaces.

### Admin Panel

- **FR-016**: Refactor AdminPanel into three sub-views: "Edit Users" (list + inline edit), "Create User" (standalone form), "Audit" (audit log viewer).
- **FR-017**: Each sub-view must maintain isolated state — switching between views does not share or leak form data.
- **FR-018**: Navigation between sub-views uses clear tabs or segmented control.

### Workspace Management

- **FR-019**: Add `POST /api/workspaces` server endpoint for creating workspaces (system_admin only per matrix).
- **FR-020**: Add workspace creation UI: form with name (required), description (optional), visibility (private/public, default private).
- **FR-021**: After workspace creation, the new workspace appears in the sidebar and is auto-selected.

### UX / Responsive

- **FR-022**: Convert sidebar and admin panel to overlay/drawer pattern on mobile viewports (below 768px).
- **FR-023**: Implement backdrop dismiss and Escape key to close overlays.
- **FR-024**: All interactive elements (buttons, links, form inputs, menu items) must have a minimum touch target of 44x44px.
- **FR-025**: Adequate spacing between interactive elements to prevent mis-taps (minimum 8px gap).

---

## Success Criteria

- A fresh install with an empty database presents the bootstrap wizard; no demo data is visible.
- Users log in with usernames, not email addresses.
- Users can generate recovery keys and use them to self-service password resets.
- All password forms require matching confirmation.
- The RBAC matrix matches `desired_permissions.md` exactly with no Guest role.
- Admin panel has three distinct sub-views with isolated state.
- System admins can create workspaces through the UI with server persistence.
- Panels use overlay patterns on mobile viewports with touch-friendly targets.
- All existing tests updated or replaced to reflect changes; new tests cover new functionality.
- Minimum 80% code coverage for server-side code.
