# Quickstart: Profile Theme Settings

## Prerequisites
- Start the application with the standard local development workflow.
- Use a valid authenticated user account.
- Ensure the database is allowed to migrate on startup so user preference storage is available.

## Manual Validation Scenarios

### 1. Dark-default readability
1. Sign in to the application.
2. Review the header, board content, filters, notifications, and account overlays.
3. Confirm headings, labels, and section titles are clearly readable against dark surfaces.

### 2. Theme preference persistence
1. Open the top-right initials icon.
2. Select `Preferences`.
3. Change the theme from dark to light and save.
4. Refresh the page.
5. Confirm the light theme remains active.
6. Sign out, sign back in, and confirm the saved theme is restored.

### 3. Profile editing
1. Open the initials icon menu and select `Profile`.
2. Change display name, initials, and avatar color.
3. Save the form.
4. Confirm the header avatar and account summary reflect the new values.

### 4. Security flow
1. Open the initials icon menu and select `Security`.
2. Attempt a password change with mismatched confirmation and confirm validation blocks submission.
3. Retry with the correct current password and matching new password.
4. Confirm success feedback appears.
5. Use `Cancel` on a subsequent attempt and verify no password change occurs.

### 5. Sign out flow
1. Open the initials icon menu.
2. Select `Sign Out`.
3. Confirm the session ends and the login screen is shown.

## Regression Focus
- Existing header controls remain accessible after the avatar-menu changes.
- Session refresh continues to hydrate app data without resetting the saved theme.
- Forced password-change and recovery flows remain unaffected.
