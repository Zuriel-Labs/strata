# Feature Specification: Admin User Deletion Workflow

**Feature Branch**: `006-delete-user-workflow`  
**Created**: 2026-03-14  
**Status**: Draft  
**Input**: User description: "Delete User functionality in the Edit Users panel. At the bottom of the panel, in the right corner, add a Red button that says \"Delete User\". When this is clicked/touched, an overlay menu appears, there will be a warning that the \"User <Username> will be removed from Strata. This cannot be undone. Are you sure?\" The prompt will provide 2 buttons, a red \"YES\" button and a blue \"Nevermind\" button. If Nevermind is selected, it goes back to the Edit Users pane. If \"YES\" is selected, display an input field where the admin must input \"DELETE\" as the value and it must match exactly. Then 2 buttons to choose from red \"BOOM\" button and blue \"CANCEL\" button. If cancelled, goes back to Edit User panel. If \"BOOM\" is selected, then process the request to delete the user and go back to the edit user panel. When the user is deleted, their account is obliterated from the platform but anything they created remains. If they are a member of a card, their membership is removed since they no longer exist. If you can think of any negative impact from the user account being deleted from the system, then prepare for it appropriately and remediate it."

## Overview

Allow system administrators to permanently delete a managed user from the Edit Users panel through a deliberate two-step destructive flow. The deletion must remove the user's account and live access paths, preserve platform content they created, scrub dangling references that would otherwise break cards or automations, and keep the admin UI stable before, during, and after the deletion.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confirm a destructive delete intentionally (Priority: P1)

As a system admin, I want a deliberate multi-step delete flow in the Edit Users panel so that I cannot remove the wrong account by accident.

**Why this priority**: The delete action is the user-facing entry point and must prevent accidental destructive actions before any backend deletion logic is exercised.

**Independent Test**: Open the Edit Users tab, select a user, trigger the delete button, walk through both confirmation overlays, and verify cancel paths always return to the edit form without changing the selected user.

**Acceptance Scenarios**:

1. **Given** I am editing a user in the Edit Users panel, **When** I view the bottom-right action area, **Then** I see a red `Delete User` button.
2. **Given** I click or tap `Delete User`, **When** the first confirmation overlay opens, **Then** it warns `User <username> will be removed from Strata. This cannot be undone. Are you sure?` and offers a red `YES` button plus a blue `Nevermind` button.
3. **Given** the first confirmation overlay is open, **When** I choose `Nevermind`, **Then** the overlay closes and I return to the Edit Users panel with the current user still selected and unchanged.
4. **Given** the first confirmation overlay is open, **When** I choose `YES`, **Then** I see a second confirmation state with an input that requires the exact value `DELETE`, a red `BOOM` button, and a blue `CANCEL` button.
5. **Given** the second confirmation state is open, **When** the typed value is anything other than the exact uppercase string `DELETE`, **Then** the destructive action is blocked and no deletion request is sent.
6. **Given** the second confirmation state is open, **When** I choose `CANCEL`, **Then** I return to the Edit Users panel without deleting the user.

---

### User Story 2 - Obliterate the account while preserving platform content (Priority: P1)

As a system admin, I want the delete action to remove the account cleanly while keeping cards, comments, and other created work intact so that historical work remains usable after a user leaves.

**Why this priority**: The backend cleanup rules determine whether deletion is safe for the platform and whether existing content stays reliable after an account is removed.

**Independent Test**: Delete a user who has sessions, workspace memberships, board memberships, card assignments, comments, activity, notifications, and automation references; confirm the account disappears, live references are scrubbed, and created artifacts still render.

**Acceptance Scenarios**:

1. **Given** I enter the exact value `DELETE` and choose `BOOM`, **When** the deletion succeeds, **Then** the user account is removed from Strata and the Edit Users panel refreshes with that user absent from the directory.
2. **Given** the deleted user had active sessions, recovery keys, password reset state, workspace memberships, board memberships, or notifications, **When** deletion completes, **Then** those access-related records are removed with the account.
3. **Given** the deleted user was assigned to one or more cards, **When** deletion completes, **Then** their card membership references are removed and the cards remain otherwise intact.
4. **Given** the deleted user created cards, comments, attachments, or activity history, **When** those artifacts are viewed later, **Then** the artifacts still exist and render with a neutral deleted-user fallback instead of a broken or blank author state.
5. **Given** an automation rule targets the deleted user for a future assignment, **When** deletion completes, **Then** that live reference is remediated so later automation runs do not assign or depend on a non-existent user.

---

### User Story 3 - Protect the platform from admin lockout or self-destruction (Priority: P2)

As a platform operator, I want guardrails around user deletion so that the platform cannot lose its final system administrator or invalidate the current admin session unexpectedly.

**Why this priority**: These cases are less frequent than the core delete flow, but they are high impact and must be handled predictably.

**Independent Test**: Attempt deletion against the signed-in admin and the last remaining system admin, and verify the server rejects the action while the UI stays in the edit flow with a clear error.

**Acceptance Scenarios**:

1. **Given** I attempt to delete my own currently authenticated user, **When** I confirm the destructive flow, **Then** the request is rejected and I remain in the Edit Users panel with a clear error explaining that self-deletion is not allowed from this flow.
2. **Given** the selected user is the last remaining active system administrator, **When** I confirm the destructive flow, **Then** the request is rejected and the platform remains administrable.
3. **Given** the deletion request fails for any validation or server-side safety reason, **When** the failure is returned, **Then** the overlay closes or resets safely, the user record remains available, and the admin sees actionable feedback.

---

### Edge Cases

- What happens when the selected user changes after the first overlay opens? The confirmation flow must stay bound to the originally selected user or close safely before deletion proceeds.
- How does the system handle comments and activity entries whose `userId` no longer resolves to an active user record? The UI must render a neutral deleted-user fallback instead of blank names or crashes.
- What happens when the deleted user is referenced by card assignments or automation assignment rules? All live references must be scrubbed or neutralized during deletion.
- What happens when the last active system admin or the currently signed-in admin is targeted? The delete operation must be blocked with a clear message.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Edit Users panel MUST render a red `Delete User` button aligned at the bottom-right of the selected-user action area.
- **FR-002**: Activating `Delete User` MUST open a destructive-action overlay that warns `User <username> will be removed from Strata. This cannot be undone. Are you sure?` and presents a red `YES` button plus a blue `Nevermind` button.
- **FR-003**: Choosing `Nevermind` in the first confirmation state MUST dismiss the overlay and return to the Edit Users panel without mutating the selected user or edit form.
- **FR-004**: Choosing `YES` MUST advance the destructive flow to a second confirmation state that requires the exact uppercase text `DELETE`, plus a red `BOOM` button and a blue `CANCEL` button.
- **FR-005**: The delete request MUST NOT be submitted unless the confirmation input exactly matches `DELETE`.
- **FR-006**: Choosing `CANCEL` in the second confirmation state MUST return the admin to the Edit Users panel without deleting the user.
- **FR-007**: The platform MUST expose a system-admin-only delete operation for managed users that permanently removes the user account.
- **FR-008**: Successful deletion MUST remove the deleted user's sessions, recovery keys, password reset records, workspace memberships, board memberships, and notifications.
- **FR-009**: Successful deletion MUST remove the deleted user's ID from card membership arrays everywhere it appears while leaving the cards themselves intact.
- **FR-010**: Successful deletion MUST preserve cards, comments, activity history, attachments, audit events, and other created artifacts that do not require an active account to exist.
- **FR-011**: The client MUST render preserved authored history for deleted accounts with a neutral deleted-user fallback identity instead of an unresolved blank state.
- **FR-012**: Any automation rule or other live assignment reference that targets the deleted user MUST be remediated during deletion so later automation runs do not depend on a non-existent user.
- **FR-013**: The delete operation MUST reject attempts to delete the currently authenticated user from the Edit Users flow.
- **FR-014**: The delete operation MUST reject attempts to delete the last remaining active system administrator.
- **FR-015**: After a successful deletion, the admin directory MUST refresh, clear destructive confirmation state, and return the admin to the Edit Users panel with another valid user selected when available.
- **FR-016**: The delete operation MUST create an audit record describing the destructive action and any remediation metadata needed to understand downstream cleanup.
- **FR-017**: If deletion fails, the system MUST return a clear error message and MUST NOT partially remove the user.

### Key Entities *(include if feature involves data)*

- **Managed User**: An admin-manageable account with profile fields, platform role, access state, memberships, authentication artifacts, and historical references across the platform.
- **Deletion Confirmation State**: The UI state that tracks the selected user, current delete step, exact-text confirmation input, pending request state, and cancel/reset behavior.
- **Live User Reference**: Any record that requires an active user to function correctly after deletion, including sessions, memberships, notifications, card member assignments, and automation assignment targets.
- **Preserved Historical Artifact**: Existing platform content created by a deleted user that must remain available after deletion, such as cards, comments, activity entries, attachments, and audit logs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A system admin can complete the full delete flow for a normal managed user in the Edit Users panel without leaving the panel and without manual database intervention.
- **SC-002**: After deletion, the removed user is absent from the admin directory and cannot authenticate through any previously active session.
- **SC-003**: Cards that previously listed the deleted user as a member show zero dangling assignments for that user after deletion.
- **SC-004**: Historical comments and activity authored by deleted users remain viewable without blank author labels or client errors.
- **SC-005**: Attempts to delete the current admin or the last remaining active system admin are rejected every time with an explicit error and no account loss.
