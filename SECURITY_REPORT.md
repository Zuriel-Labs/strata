# Strata Security Audit Report

**Date:** 2026-05-20
**Scope:** Full-stack security threat model — server, client, Docker, dependencies, infrastructure
**Reviewer:** Automated security review via Hermes Agent

---

## Executive Summary

Strata is a kanban/project management web app built with React 19 + Vite (frontend) and Express 5 + better-sqlite3 (backend). The application implements authentication, RBAC, session management, and an admin panel. The review found **17 findings** across 6 domains.

**Overall risk posture: Moderate.** The app demonstrates several solid security practices — parameterized SQL queries throughout, httpOnly session cookies, Zod input validation on all API routes, bcrypt password hashing, and proper RBAC enforcement. However, significant gaps exist in the absence of production HTTP security hardening (no Helmet/CSP, no rate limiting, no CSRF protection), insecure cookie configuration (`secure: false`), a missing session expiry mechanism, and several information leakage vectors. The Docker and Kubernetes configurations are reasonably well-hardened.

**Critical findings:** 1 | **High findings:** 4 | **Medium findings:** 7 | **Low findings:** 5

---

## Findings

### 1. Session Cookie Insecure — `secure: false`
- **Severity:** Critical
- **File:** `server/src/auth/session.ts:12`
- **Impact:** Session cookies are transmitted over cleartext HTTP, allowing network-level session hijacking on any non-TLS connection. Even with TLS termination at the ingress (as in the Helm deployment), the cookie will be sent in the clear between the ingress proxy and the Node.js pod on the internal network.
- **Detail:** The `setSessionCookie` function explicitly sets `secure: false`. In production, all session cookies must use `secure: true` so they are only sent over HTTPS. The ingress terminates TLS, but the internal request from ingress to pod typically travels over HTTP — the `X-Forwarded-Proto` header should be trusted to set the `secure` flag conditionally.
- **Remediation:** Set `secure: true` in production, or dynamically set it based on `X-Forwarded-Proto` / `NODE_ENV`. Add `app.set('trust proxy', 1)` when behind a reverse proxy so Express respects the forwarded headers.

### 2. No Rate Limiting on Authentication Endpoints
- **Severity:** High
- **Files:** `server/src/routes/auth-routes.ts:106` (login), `server/src/routes/auth-routes.ts:266` (recovery key consume), `server/src/routes/auth-routes.ts:63` (bootstrap)
- **Impact:** The `/api/auth/login` endpoint is vulnerable to brute-force password guessing attacks. The `/api/auth/recovery-key/consume` endpoint is also unprotected. An attacker can make unlimited login attempts at high speed.
- **Remediation:** Add rate-limiting middleware (e.g., `express-rate-limit`) to authentication endpoints. Recommended: 5 attempts per minute per IP for login, 3 per minute for recovery key consumption. Also consider account lockout after N failed attempts with audit trail.

### 3. No CSRF Protection
- **Severity:** High
- **Files:** All state-changing routes in `server/src/routes/*.ts`
- **Impact:** All POST, PATCH, and DELETE endpoints are vulnerable to Cross-Site Request Forgery. The session cookie is sent automatically with cross-origin requests. An attacker can trick an authenticated user's browser into performing actions (creating boards, deleting cards, changing passwords, admin user creation) without their consent.
- **Note:** The `sameSite: 'lax'` cookie attribute provides partial protection for non-GET requests from top-level navigations, but does not protect against: sub-subequests, same-site attackers, or requests triggered by JavaScript (fetch with credentials). All mutations use POST/PATCH/DELETE which are covered by `sameSite: 'lax'` for top-level navigations, but a sophisticated attacker can use sub-requests or same-site origins.
- **Remediation:** Implement CSRF token protection (e.g., `csurf` or a double-submit cookie pattern). Since the API uses cookie-based auth, CSRF tokens are essential for all mutating endpoints.

### 4. No Helmet / Security Headers / CSP
- **Severity:** High
- **File:** `server/src/app.ts` — no security middleware imported
- **Impact:** The application sends no security headers: no `Content-Security-Policy`, no `X-Content-Type-Options`, no `X-Frame-Options`, no `Strict-Transport-Security`, no `X-XSS-Protection`. This opens the door to clickjacking, MIME-sniffing attacks, and content injection.
- **Remediation:** Add `helmet` middleware at the top of the Express stack:
  ```javascript
  import helmet from 'helmet';
  app.use(helmet());
  ```
  Configure CSP to restrict script sources to `'self'` and any required CDN origins. Add HSTS headers with a long `max-age`.

### 5. No Session Expiry / Rotation on Privilege Change
- **Severity:** High
- **Files:** `server/src/auth/session.ts`, `server/src/db/repositories.ts:177-195`
- **Impact:** Sessions have a 24-hour TTL (`1000 * 60 * 60 * 24`) but the `getSession` function refreshes `last_seen_at` on every request without extending the expiry. More critically, when a user's role is changed (e.g., demoted from system_admin to user, or account deactivated), existing sessions remain valid until they expire naturally. There is no mechanism to invalidate sessions on privilege changes.
- **Remediation:** Implement session rotation or invalidation on privilege changes. When an admin changes a user's role or active status, all sessions for that user should be deleted. Consider implementing a session version counter in the users table that is checked on each request.

### 6. Invite Token / Recovery Key Returned in Admin API Response
- **Severity:** Medium
- **File:** `server/src/routes/admin-routes.ts:74`
- **Impact:** When a system admin creates a user via `POST /api/admin/users`, the plaintext `inviteToken` is returned in the response body. This token functions as a one-time password reset mechanism. If the admin's session is compromised or the response is logged, the token is exposed. The same pattern exists for recovery key generation (line 117).
- **Remediation:** Consider delivering invite tokens out-of-band (e.g., email) rather than returning them in the API response. At minimum, ensure API responses are not logged at INFO level, and document the security implications.

### 7. Error Messages Leak Internal Details
- **Severity:** Medium
- **Files:** `server/src/app.ts:68-70`
- **Detail:** The global error handler returns `error.message` to the client for any `Error` instance:
  ```typescript
  message: error instanceof Error ? error.message : 'Unexpected server error.'
  ```
  This can expose internal details like database errors, file paths, or stack trace fragments.
- **Remediation:** In production (`NODE_ENV === 'production'`), return a generic error message. Log the full error server-side. Only return specific messages for known, safe error types (Zod validation errors, auth errors).

### 8. Notification Endpoints Lack Authorization
- **Severity:** Medium
- **File:** `server/src/routes/automation-routes.ts:226-228`
- **Impact:** The `POST /api/notifications/:notificationId/read` endpoint marks any notification as read based solely on the notification ID from the URL. Any authenticated user can mark any other user's notifications as read. The `POST /api/notifications/read-all` endpoint correctly filters by `request.auth!.user.id`, so it's not vulnerable, but the per-notification endpoint has no ownership check.
- **Remediation:** Verify that the notification belongs to the authenticated user before marking it read:
  ```typescript
  const notification = getNotification(db, notificationId);
  if (!notification || notification.userId !== request.auth!.user.id) {
    return response.status(403).json({ message: 'Forbidden.' });
  }
  ```

### 9. Session Cookie Name Configurable via Environment Variable but Used Inconsistently
- **Severity:** Medium
- **Files:** `server/src/auth/session.ts:6` vs `server/src/routes/auth-routes.ts:138`
- **Detail:** The session cookie name is defined as `SESSION_COOKIE = process.env.STRATA_SESSION_COOKIE ?? 'strata_session'` in `session.ts`, but the logout handler in `auth-routes.ts:138` hardcodes a fallback using `request.cookies?.strata_session` before checking the environment variable:
  ```typescript
  const sessionId = request.cookies?.strata_session ?? request.cookies?.[process.env.STRATA_SESSION_COOKIE ?? 'strata_session'];
  ```
  This is reversed logic — the hardcoded name is checked first, meaning if the cookie name is customized, the logout would try the wrong cookie name first.
- **Remediation:** Use the `SESSION_COOKIE` constant consistently:
  ```typescript
  const sessionId = request.cookies?.[SESSION_COOKIE];
  ```

### 10. Bootstrap Endpoint Race Condition
- **Severity:** Medium
- **File:** `server/src/routes/auth-routes.ts:63-104`
- **Impact:** The `/api/auth/bootstrap` endpoint checks if users exist and then creates one, but this is not done in a transaction. In a race condition scenario, two concurrent bootstrap requests could both pass the `users.length === 0` check and both create an admin user.
- **Remediation:** Wrap the bootstrap check-and-insert in a database transaction, or add a UNIQUE constraint that prevents duplicate bootstrap (the `username` UNIQUE constraint partially mitigates this, but only if the usernames differ).

### 11. JSON Body Limit Too Large (12MB)
- **Severity:** Medium
- **File:** `server/src/app.ts:15`
- **Detail:** `JSON_BODY_LIMIT` is set to `12mb`. This is significantly larger than needed for a kanban application. Card descriptions, checklists, and comments are stored as JSON columns, but individual request payloads should rarely exceed 1MB. A 12MB limit exposes the server to denial-of-service via large request bodies that are parsed into memory.
- **Remediation:** Reduce the JSON body limit to 1–2MB maximum. Apply smaller per-route limits for specific endpoints (e.g., 100KB for auth endpoints).

### 12. No CORS Configuration
- **Severity:** Medium
- **File:** `server/src/app.ts` — no CORS middleware
- **Impact:** The API does not explicitly configure CORS. Since the frontend is served from the same origin (SPA pattern), this is acceptable for same-origin usage. However, if the API is ever exposed on a different origin or if a developer enables cross-origin access, there are no restrictive defaults in place.
- **Remediation:** Add `cors` middleware with an explicit allowlist of origins (or disable it entirely for same-origin deployment). This documents the security intent.

### 13. Docker Image Uses `node:22-bookworm` (Large Base Image)
- **Severity:** Low
- **File:** `Dockerfile:1`
- **Detail:** The builder stage uses `node:22-bookworm` (~1.1GB) rather than a slim variant. While the runtime stage correctly uses `node:22-bookworm-slim`, the builder stage pulls in unnecessary packages, increasing build time and attack surface during CI.
- **Remediation:** Use `node:22-bookworm-slim` for the builder stage as well, or use Alpine-based images (`node:22-alpine`) for both stages. The `better-sqlite3` native module requires build tools, so if Alpine is used, ensure `python3`, `make`, and `g++` are available during build only.

### 14. Sensitive Data in Seed Files
- **Severity:** Low
- **File:** `server/src/seed/bootstrap.ts:31-37`
- **Detail:** Hardcoded passwords are present in the seed data: `'ChangeMe123!'`, `'WorkspaceAdmin123!'`, etc. While this is guarded by `SEED_DATA !== 'true'` and is not included in production, if this code path is accidentally triggered, it creates known-credential accounts.
- **Remediation:** If seed data is needed, generate random passwords and log them, or require passwords to be set via environment variables. Remove hardcoded credentials from source code.

### 15. `npm audit` — 5 Critical Severity Vulnerabilities
- **Severity:** Low (dev dependencies only)
- **Files:** `package.json`, `package-lock.json`
- **Detail:** The audit reveals 13 vulnerabilities total:
  - **minimist** (critical): Prototype pollution — used by `html-inline` (dev-only)
  - **flatted** (high): Prototype pollution — used transitively by dev tooling
  - **path-to-regexp** (high): ReDoS — used by Express 5 routing (this IS in production)
  - **picomatch** (high): Method injection — used by test tools
  - **vite** (high): Path traversal and file read vulnerabilities — dev dependency only
  - **postcss** (moderate): XSS via unescaped `</style>` — dev dependency only
  - **ws** (moderate): Uninitialized memory disclosure — dev dependency only
  - **yaml** (moderate): Stack overflow — dev dependency only
  - **brace-expansion** (moderate): ReDoS — dev dependency only
- **Remediation:** The most concerning production dependency is `path-to-regexp` (bundled with Express 5). Monitor for a patched version. Run `npm audit fix` to resolve what's automatable. Remove `html-inline` (dev dependency pulling in critical minimist vulnerability with transitive dependencies on `html-select`, `html-tokenize`, `trumpet`).

### 16. Kubernetes — Liveness Probe Disabled
- **Severity:** Low
- **File:** `~/git-clones/homelab/apps/strata/values.yaml:21-23`
- **Detail:** The liveness probe has `enabled: false`. This means Kubernetes won't restart the pod if the application becomes unresponsive (deadlocks, infinite loops, memory exhaustion). The readiness and startup probes are also disabled.
- **Remediation:** Enable liveness and readiness probes. The health check endpoint `/api/health` already exists and is used in the Docker HEALTHCHECK. Kubernetes probes should use the same endpoint.

### 17. Kubernetes — No Network Policies, No Resource Limits
- **Severity:** Low
- **File:** `~/git-clones/homelab/apps/strata/values.yaml`
- **Detail:** The Helm values don't specify resource limits/requests or network policies. Without resource limits, a misbehaving or compromised pod could consume all node resources.
- **Remediation:** Add resource requests and limits. Add a NetworkPolicy restricting egress to only necessary connections (DNS, NFS, and any external APIs). This limits blast radius in a compromise scenario.

---

## Positive Security Observations

The following practices are well-implemented and should be maintained:

1. **Parameterized SQL Queries:** All database queries use parameterized statements (`?` placeholders) via `better-sqlite3`. No string concatenation in SQL. This comprehensively prevents SQL injection.

2. **Zod Input Validation:** Every API route validates request bodies with Zod schemas before processing. This prevents unexpected input types and malformed payloads.

3. **Bcrypt Password Hashing:** Passwords are hashed with bcrypt (cost factor 10) via `bcryptjs`. Temporary passwords are generated with `randomBytes(32)`.

4. **RBAC Enforcement:** Every mutating route checks permissions via the policy layer (`canManageBoard`, `canManageWorkspace`, `isSystemAdmin`, etc.). The admin routes require `requireAuth` middleware and an `isSystemAdmin` check.

5. **httpOnly Session Cookies:** Session tokens are stored in httpOnly cookies, preventing JavaScript access.

6. **Audit Logging:** Security-sensitive operations (auth, admin user management) are logged with actor, target, action, and outcome.

7. **Docker Non-Root User:** The container runs as `USER node` (UID 1000), not root. The Helm values enforce `runAsUser: 1000`.

8. **Docker Multi-Stage Build:** The Dockerfile uses a separate builder and runtime stage, keeping dev dependencies out of the final image.

9. **Docker HEALTHCHECK:** A health check is configured that queries `/api/health`.

10. **No Client-Side Secrets:** The frontend has no `import.meta.env` or `process.env` usage leaking API keys. All API calls use relative paths with `credentials: 'include'`.

11. **No `dangerouslySetInnerHTML`:** No instance of React's XSS-prone `dangerouslySetInnerHTML` was found in the frontend code.

12. **TLS in Kubernetes:** The Helm values configure ingress with TLS via cert-manager (`letsencrypt-prod` cluster issuer).

13. **Session Invalidation on Logout:** The `destroyUserSession` function deletes the session from the database and clears the cookie.

14. **No SSRF Vectors:** The server makes no outbound HTTP requests to user-controlled URLs.

---

## Dependency Summary

| Severity | Count | Production-Relevant? |
|----------|-------|----------------------|
| Critical | 5 | minimist (dev only) |
| High | 4 | path-to-regexp (prod), flatted (dev), picomatch (dev), vite (dev) |
| Moderate | 4 | postcss (dev), ws (dev), yaml (dev), brace-expansion (dev) |
| Low | 0 | — |

**Production-critical vulnerability:** `path-to-regexp` (used by Express 5 for route matching) has a ReDoS vulnerability via sequential optional groups and multiple wildcards. This should be monitored for a patch from the Express team.

---

## Infrastructure Security Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| Container runs as non-root | ✅ Pass | `USER node` in Dockerfile, `runAsUser: 1000` in Helm |
| Multi-stage build | ✅ Pass | Builder → runtime separation |
| Health check | ✅ Pass | Docker HEALTHCHECK and `/api/health` endpoint |
| TLS termination | ✅ Pass | Ingress TLS via cert-manager |
| Security context | ✅ Pass | `fsGroup: 1000`, `runAsUser/Group: 1000` |
| NFS persistence | ⚠️ Note | NFS mount for SQLite — acceptable for single-pod deployment |
| Liveness/readiness probes | ❌ Fail | Disabled in Helm values |
| Resource limits | ❌ Fail | No CPU/memory requests or limits |
| Network policies | ❌ Fail | No network policies defined |
| Cookie secure flag | ❌ Fail | `secure: false` in production |

---

## Recommended Priority Actions

1. **[P0]** Set `secure: true` on session cookies in production (Finding #1)
2. **[P0]** Add rate limiting to auth endpoints (Finding #2)
3. **[P1]** Add CSRF protection for all mutating endpoints (Finding #3)
4. **[P1]** Add `helmet` middleware with CSP (Finding #4)
5. **[P1]** Implement session invalidation on privilege changes (Finding #5)
6. **[P2]** Fix notification authorization bypass (Finding #8)
7. **[P2]** Fix inconsistent session cookie name usage (Finding #9)
8. **[P2]** Reduce JSON body limit to 1-2MB (Finding #11)
9. **[P2]** Enable Kubernetes liveness/readiness probes (Finding #16)
10. **[P3]** Run `npm audit fix` and remove `html-inline` dependency (Finding #15)
11. **[P3]** Add resource limits and network policies to Helm values (Finding #17)