# Quickstart: Admin User Deletion Workflow

## Goal

Validate the guarded delete-user flow from the admin panel through backend cleanup and preserved-history rendering.

## Prerequisites

1. Start the app with an authenticated `system_admin` session.
2. Ensure at least two users exist so a non-critical account can be deleted.
3. Seed or create a target user with:
   - workspace and board memberships
   - at least one card assignment
   - at least one comment or activity entry
   - optionally an automation rule that assigns that user

## Manual Validation Scenarios

### Scenario 1: Cancel out of the destructive flow
1. Open the admin panel and choose `Edit Users`.
2. Select a target user.
3. Click `Delete User`.
4. Verify the warning text includes the username.
5. Click `Nevermind` and confirm the edit form remains unchanged.
6. Repeat, click `YES`, then click `CANCEL`, and confirm the user still exists.

### Scenario 2: Enforce exact `DELETE` confirmation
1. Open the second confirmation step.
2. Enter a near-match such as `delete` or `DELETE `.
3. Verify the destructive action is blocked.
4. Enter the exact value `DELETE`.
5. Click `BOOM` and verify the delete request proceeds.

### Scenario 3: Verify cleanup and preserved artifacts
1. Delete a non-admin target user.
2. Re-open the directory and confirm the user is absent.
3. Inspect cards that previously contained that member and confirm the member chip is gone.
4. Inspect comments or activity by the deleted user and confirm they still render with a deleted-user fallback.
5. Verify any targeted automation assignment no longer references the deleted user.

### Scenario 4: Verify safety rejections
1. Attempt to delete the currently signed-in admin and confirm the request is rejected.
2. Attempt to delete the last remaining active system admin and confirm the request is rejected.

## Suggested Verification Commands

```bash
npm run test -- src/App.admin.test.tsx server/tests/admin-routes.test.ts
npm run lint
```
