# Feature Specification: Profile Theme Settings

**Feature Branch**: `009-profile-theme-settings`  
**Created**: 2026-03-16  
**Status**: Draft  
**Input**: User description: "Overhaul to frontend UI/UX: improve dark mode contrast, add light mode, and expand the top-right initials menu into Profile, Preferences, Security, and Sign Out with consistent sub-overlay navigation."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Readable themes for daily work (Priority: P1)

As a signed-in user, I want the application to remain dark-mode-first while improving contrast on headings and important labels, and I want a light mode alternative that I can switch to when needed.

**Why this priority**: Theme readability affects every authenticated screen and directly addresses the accessibility concern described in the request.

**Independent Test**: Can be fully tested by signing in, reviewing key boards and overlays in dark mode for stronger text contrast, switching to light mode, and confirming the selected theme remains active after refreshing or signing in again.

**Acceptance Scenarios**:

1. **Given** a signed-in user viewing the app in its default theme, **When** they open pages and overlays with headers and section titles, **Then** those titles remain clearly distinguishable from dark backgrounds without changing the application away from a dark-default experience.
2. **Given** a signed-in user opening theme preferences, **When** they select light mode, **Then** the application immediately updates to a light palette that preserves hierarchy, readability, and interactive affordances.
3. **Given** a signed-in user has selected a theme, **When** they refresh the page or start a new authenticated session, **Then** the same theme choice is restored.

---

### User Story 2 - Manage personal profile and preferences from the avatar menu (Priority: P2)

As a signed-in user, I want the initials icon in the top-right corner to open a clear account menu with Profile and Preferences sections so I can manage how I am represented and how the interface looks.

**Why this priority**: The requested account menu structure is the entry point for profile and preference management and must be intuitive on both desktop and touch devices.

**Independent Test**: Can be fully tested by opening the initials menu, confirming the four menu entries, entering Profile and Preferences sub-overlays, using the back and close controls, saving changes, and confirming the header avatar and theme update correctly.

**Acceptance Scenarios**:

1. **Given** a signed-in user viewing the header, **When** they click or tap the initials icon, **Then** an overlay menu appears listing `Profile`, `Preferences`, `Security`, and `Sign Out`.
2. **Given** the user selects `Profile` or `Preferences`, **When** the sub-overlay opens, **Then** it shows a back button on the top left and a close button on the top right with the same placement and behavior across sub-overlays.
3. **Given** the user updates their display name, initials, or avatar color in `Profile`, **When** they save the form, **Then** the new values are stored and reflected in the top-right initials icon and account summary.
4. **Given** the user changes theme selection in `Preferences`, **When** they save the form, **Then** the theme change is applied and available the next time they use the app.

---

### User Story 3 - Manage account security and sign out safely (Priority: P3)

As a signed-in user, I want to manage recovery access, change my password from the same account menu, and sign out cleanly so I can manage security without needing admin help.

**Why this priority**: Security controls are essential self-service capabilities, but they depend on the new menu and settings structure being in place.

**Independent Test**: Can be fully tested by opening `Security`, generating a recovery key, submitting valid and invalid password-change attempts, canceling out of the form, and choosing `Sign Out` to return to the login screen.

**Acceptance Scenarios**:

1. **Given** a signed-in user opens `Security`, **When** the sub-overlay loads, **Then** it includes recovery-key generation plus fields for current password, new password, confirm new password, and `Change` and `Cancel` actions.
2. **Given** the user generates a recovery key, **When** the request succeeds, **Then** the system displays the new key, explains that it must be kept safe, and offers copy-to-clipboard and close actions.
3. **Given** the user enters mismatched or incomplete password values, **When** they attempt to submit, **Then** the system blocks the change and explains what must be corrected.
4. **Given** the user enters valid password details, **When** they select `Change`, **Then** the password is updated and the user receives clear success feedback.
5. **Given** the user chooses `Sign Out` from the initials menu, **When** sign-out completes, **Then** their session ends and they are returned to the login page.

### Edge Cases

- If a user opens a sub-overlay and then chooses `Back`, unsaved changes are discarded unless they were explicitly saved.
- If a profile update is invalid, the user remains in the current sub-overlay and sees field-level guidance without losing previously entered values.
- If a saved avatar color would reduce contrast for the displayed initials, the system adjusts text treatment so the initials remain readable.
- If a user selects the same theme they already use, the save flow avoids unnecessary disruption while confirming the current preference.
- If a password change request fails because the current password is wrong or the session is no longer valid, the user sees a clear error and remains able to retry or cancel.
- If a user signs out while a sub-overlay is open, all account overlays close and the next screen shown is the login experience.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST keep dark mode as the default authenticated experience while increasing contrast between dark backgrounds and key headings, labels, and section titles.
- **FR-002**: The system MUST provide a light mode palette that covers the authenticated application shell, overlays, forms, boards, and other primary interface surfaces with readable text and clear visual hierarchy.
- **FR-003**: Signed-in users MUST be able to open the top-right initials icon menu and see exactly four top-level actions: `Profile`, `Preferences`, `Security`, and `Sign Out`.
- **FR-004**: The system MUST open `Profile`, `Preferences`, and `Security` in sub-overlays that all include a back button on the top left and a close button on the top right with consistent interaction behavior.
- **FR-005**: Signed-in users MUST be able to update their display name, initials, and initials icon color from `Profile`.
- **FR-006**: The system MUST validate profile edits before saving and preserve the latest saved values for future authenticated sessions.
- **FR-007**: Signed-in users MUST be able to choose between dark mode and light mode from `Preferences`.
- **FR-008**: The system MUST save the user’s selected theme preference and restore it on future authenticated sessions.
- **FR-009**: Signed-in users MUST be able to open `Security`, generate a new recovery key, view the generated key, and use copy and close actions from the same sub-overlay.
- **FR-010**: The system MUST inform users that a generated recovery key must be kept safe.
- **FR-011**: Signed-in users MUST be able to submit current password, new password, and confirmed new password from `Security` to change their password.
- **FR-012**: The system MUST prevent password changes when the current password is invalid, the new password confirmation does not match, or required fields are missing, and it MUST communicate the error clearly.
- **FR-013**: The system MUST allow users to cancel out of `Security` without changing their password.
- **FR-014**: The system MUST allow users to sign out from the initials menu and return them to the login page after the session is cleared.
- **FR-015**: The initials menu and its sub-overlays MUST work with pointer, touch, and keyboard interaction.
- **FR-016**: The updated theme and account menu flows MUST preserve readable focus states, readable avatar initials, and sufficient contrast for primary text in both dark and light themes.

### Key Entities *(include if feature involves data)*

- **User Profile Settings**: The signed-in user’s self-managed identity fields used in the header and account surfaces, including display name, initials, and initials icon color.
- **User Theme Preference**: The signed-in user’s saved appearance choice, including whether dark mode or light mode should be restored for future sessions.
- **Account Menu View State**: The current overlay state for the account menu, including which top-level menu or sub-overlay is visible and whether the user is navigating back, closing, saving, or canceling.
- **Password Change Request**: A security action containing the current password, new password, and confirmation used to validate and apply a password change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability validation across the authenticated shell, all primary headings and section labels remain visually distinct from their background in both dark and light themes without requiring users to zoom.
- **SC-002**: A signed-in user can open the account menu, reach each of the four actions, and complete Profile, Preferences, Security, and Sign Out flows in 3 interactions or fewer from the first menu open.
- **SC-003**: At least 90% of test users can change their theme preference and see the new theme applied on their first attempt without assistance.
- **SC-004**: At least 90% of test users can update profile details or change their password successfully on the first attempt when providing valid data.
