# Spec: Auth Endpoint Protection — Rate Limiting & CSRF (Issue #2)

## Goal

Protect authentication endpoints against brute-force attacks with per-IP rate limiting,
and protect all state-changing endpoints against Cross-Site Request Forgery (CSRF) using
the double-submit cookie pattern.

## Users

- **End users**: Log in, change passwords, manage recovery keys. Rate limiting must not
  break normal usage patterns (5 login attempts/min is generous; 3 for bootstrap/recovery).
- **Administrators**: Manage users, generate recovery keys. Same CSRF protection as users.
- **Canary seed data**: The bootstrap endpoint (`/api/auth/bootstrap`) must remain usable
  for initial platform setup. Rate limiting must not block the legitimate first-time setup.

## Data Model

No database changes required. All state is in-memory (rate limit counters) and
cookie-based (CSRF tokens).

### CSRF Token Flow (Double-Submit Cookie)

1. Client sends GET `/api/auth/csrf-token` → server sets `strata_csrf` cookie with a
   cryptographically random token and returns the token value as JSON.
2. Client includes the token in an `X-CSRF-Token` header on all mutating requests
   (POST, PATCH, PUT, DELETE).
3. Server middleware compares the `X-CSRF-Token` header value against the `strata_csrf`
   cookie value. If they don't match, reject with 403.
4. Login and bootstrap are exempt from CSRF (no session yet, the CSRF cookie is set
   during the initial page load or csrf-token request).

### Rate Limit Configuration

| Endpoint | Window | Max Attempts | Key |
|----------|--------|-------------|-----|
| `/api/auth/login` | 1 min | 5 | IP |
| `/api/auth/recovery-key/consume` | 1 min | 3 | IP |
| `/api/auth/bootstrap` | 1 min | 3 | IP |

- Standard `429 Too Many Requests` response with `Retry-After` header.
- Rate limit counters are in-memory (no Redis needed — single-instance app).

### Exempt Routes

- `GET /api/auth/needs-bootstrap` — read-only, no rate limit needed
- `GET /api/auth/session` — read-only, no rate limit needed
- `GET /api/auth/csrf-token` — must be accessible to get the token
- `POST /api/auth/login` — rate limited but CSRF-exempt (no session yet)
- `POST /api/auth/bootstrap` — rate limited but CSRF-exempt (no session yet)
- `POST /api/auth/recovery-key/consume` — rate limited, CSRF-exempt (no session)

## Views & Navigation

No UI changes required for rate limiting (429 errors are already handled by the
client's `ApiError` class). The CSRF token fetch is transparent to existing UI code —
the `apiRequest` function in `src/services/api.ts` needs to:
1. Fetch a CSRF token on app initialization
2. Include the `X-CSRF-Token` header on all mutating requests

## API/Data Flow

### CSRF Token Lifecycle

```
App loads → GET /api/auth/csrf-token
  → Server generates token, sets strata_csrf cookie, returns { csrfToken: "..." }
  → Client stores token, includes in X-CSRF-Token header on mutations

POST/PATCH/PUT/DELETE request:
  → Server checks X-CSRF-Token header against strata_csrf cookie
  → Match → proceed
  → Mismatch/missing → 403 Forbidden
```

### Exempt Mutations (No CSRF Required)

- `POST /api/auth/login` — no session, intentionally CSRF-exempt
- `POST /api/auth/bootstrap` — no session, intentionally CSRF-exempt
- `POST /api/auth/recovery-key/consume` — no session, intentionally CSRF-exempt

These are safe because:
- Login/bootstrap: attacker gains nothing by CSRF (they'd log the victim in as attacker)
- Recovery key consume: attacker can't force victim to submit a specific recovery key

## Edge Cases

1. **CSRF cookie missing but header present**: Return 403. Both must be present.
2. **CSRF header missing but cookie present**: Return 403. Both must match.
3. **CSRF token mismatch**: Return 403.
4. **Rate limit hit during canary seed**: The seed script runs server-side and doesn't
   go through HTTP, so rate limiting doesn't affect it. But if someone hits bootstrap
   3 times in a minute, the 4th gets 429 — correct behavior.
5. **Multiple tabs**: The CSRF token is the same across tabs (same cookie + same stored
   value), so no cross-tab conflict.
6. **Token rotation**: Simple implementation does NOT rotate tokens on each request.
   The token is set once and persists for the cookie lifetime. This is secure enough for
   the double-submit pattern when combined with SameSite cookies.
7. **429 response body**: `{ message: "Too many requests. Please try again later." }`
   with `Retry-After` header in seconds.

## v1 Scope (IN)

- `express-rate-limit` middleware on auth endpoints with per-IP limits
- Double-submit cookie CSRF protection on all mutating endpoints
- CSRF token endpoint (GET /api/auth/csrf-token)
- CSRF middleware applied globally to POST/PATCH/PUT/DELETE
- Auth endpoints (login, bootstrap, recovery-key/consume) exempt from CSRF
- Client `apiRequest` updated to fetch and include CSRF token
- Tests for rate limiting behavior (429 responses)
- Tests for CSRF enforcement (403 on missing/mismatched tokens)

## Out of Scope (OUT)

- Account lockout after N failed attempts (future enhancement)
- Redis-backed rate limiting (single-instance app, in-memory is fine)
- CSRF token rotation per request (overkill for double-submit pattern)
- Rate limiting on non-auth endpoints
- CAPTCHA or other challenge mechanisms

## Open Questions

- None. The issue spec is clear on the requirements and approach.