# Tasks: Issue #4 — Security: Authorization gaps

## Task 1: Add getNotificationById repository helper
- [ ] Add `getNotificationById(db, notificationId)` in `server/src/db/repositories.ts`
- [ ] Returns `Notification | null`
- **AC:** Function exists and compiles.

## Task 2: Fix notification read endpoint ownership check
- [ ] Update `POST /api/notifications/:notificationId/read` in `server/src/routes/automation-routes.ts`
- [ ] Import `getNotificationById`
- [ ] Call it, return 404 if null, return 403 if `notification.userId !== request.auth!.user.id`
- [ ] Only if authorized, call `markNotificationRead`
- **AC:** Returns 403 for cross-user notification, 404 for missing notification, 200 for own notification.

## Task 3: Wrap bootstrap in transaction
- [ ] Update `POST /api/auth/bootstrap` in `server/src/routes/auth-routes.ts`
- [ ] Wrap `listUsers` check + insert in `db.transaction(() => { ... })()`
- [ ] Return 409 if transaction returns false (users already exist)
- **AC:** Existing bootstrap tests pass; new test added for 409 on already-seeded DB.

## Task 4: Add sensitive-data header to admin endpoints
- [ ] In `server/src/routes/admin-routes.ts`, add `response.setHeader('X-Sensitive-Data', 'true')` before JSON response for:
  - `POST /api/admin/users`
  - `POST /api/admin/users/:userId/generate-recovery-key`
- **AC:** Headers present in responses.

## Task 5: Write tests for notification ownership enforcement
- [ ] In `server/tests/crud-routes.test.ts`, add tests under `describe('notification routes')`:
  - Marks a single notification as read when owner requests it
  - Returns 403 when a different user tries to mark it read
- **AC:** Tests pass.

## Task 6: Write tests for bootstrap transaction
- [ ] In `server/tests/auth-routes.test.ts`, add test:
  - `POST /api/auth/bootstrap` returns 409 when DB already has users
- **AC:** Test passes.

## Task 7: Run full test suite
- [ ] `npm run test` must pass (no regressions)
- [ ] `npm run typecheck` must pass
- [ ] `npm run lint` must pass
- **Dependency:** All tasks above done.

## Task 8: Commit and open PR
- [ ] Commit with conventional commit style
- [ ] Push branch
- [ ] Open non-draft PR via `gh api`
- **Dependency:** All tests pass.
