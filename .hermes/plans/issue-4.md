# Plan: Issue #4 — Security: Authorization gaps

## Files to Change
1. **server/src/db/repositories.ts**
   - Add `getNotificationById(db, notificationId)` function.

2. **server/src/routes/automation-routes.ts**
   - Fix `POST /api/notifications/:notificationId/read` to fetch notification by ID and verify `notification.userId === request.auth.user.id` before marking read.
   - Return 404 if notification missing, 403 if ownership mismatch.

3. **server/src/routes/auth-routes.ts**
   - Wrap bootstrap check-and-insert in a `db.transaction()` to prevent race condition where two concurrent requests could both pass `users.length === 0`.
   - Return 409 if inside transaction users already exist.

4. **server/src/routes/admin-routes.ts**
   - Add `response.setHeader('X-Sensitive-Data', 'true')` on `POST /api/admin/users` and `POST /api/admin/users/:userId/generate-recovery-key`.

5. **server/tests/crud-routes.test.ts**
   - Add a test for the per-notification read endpoint (existing suite only has `/read-all`).
   - Test that reading another user's notification returns 403.
   - Test that reading own notification returns 200.

6. **server/tests/auth-routes.test.ts**
   - Add a test that verifies bootstrap returns 409 when DB is already seeded.

## Data Flow
1. `POST /api/notifications/:id/read` → `getNotificationById` → compare userId → `markNotificationRead`.
2. `POST /api/auth/bootstrap` → `db.transaction(() => { const users = listUsers(db); if (users.length > 0) return false; ... })`.
3. `POST /api/admin/users` and `/generate-recovery-key` → `response.setHeader('X-Sensitive-Data', 'true')` before `response.json(...)`.
