# Spec: Issue #4 — Security: Authorization gaps

## Goal
Address three medium-severity authorization and race-condition findings in the Strata API:
1. Notification read endpoint lacks ownership check
2. Bootstrap endpoint has a race condition
3. Admin API exposes sensitive invite/recovery tokens without marking responses as sensitive

## Users
- Authenticated end users (notification fix)
- System administrators (bootstrap robustness, token exposure awareness)

## Data Model
- `notifications` table: `id`, `user_id`, `card_id`, `board_id`, `message`, `read`, `created_at`
- `users` table: `id`, `username`, `platform_role`, `password_hash`, etc.
- `recovery_keys` table: `id`, `user_id`, `key_hash`, `created_at`

## Views & Navigation
No UI changes. Backend API only.

## API / Data Flow
1. `POST /api/notifications/:notificationId/read` → verify notification owner → mark read.
2. `POST /api/auth/bootstrap` → wrap check-and-insert in a transaction.
3. `POST /api/admin/users` and `POST /api/admin/users/:userId/generate-recovery-key` → add `X-Sensitive-Data: true` response header.

## Edge Cases
- Notification not found: 404 before the ownership check (or 404 after — keep  semantics simple as 404 if missing).
- Cross-user notification read: 403 Forbidden.
- Bootstrap already completed: return existing 409.
- Transaction rollback: SQLite `db.transaction()` handles it automatically.

## v1 Scope (IN)
- Fix #1: Ownership check for notification read endpoint.
- Fix #2: Transaction-wrapped bootstrap check-and-insert.
- Fix #3: `X-Sensitive-Data: true` header on admin endpoints returning tokens.
- Add/update unit + integration tests for fixes #1 and #2.

## Out of Scope (OUT)
- Out-of-band token delivery (e.g., email). We keep tokens in response per recommendation.
- Full token logging audit across the platform.

## Open Questions
- None — issue body is explicit.
