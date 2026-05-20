# Plan: Auth Endpoint Protection — Rate Limiting & CSRF (Issue #2)

## File Changes

### New Files

1. **`server/src/middleware/rate-limit.ts`** — Rate limiter configuration and middleware
   - Create rate limiters for auth endpoints using `express-rate-limit`
   - Export configured limiters: `loginLimiter`, `bootstrapLimiter`, `recoveryKeyLimiter`

2. **`server/src/middleware/csrf.ts`** — CSRF protection middleware
   - Generate CSRF token, set `strata_csrf` cookie
   - Validate double-submit pattern on mutating requests
   - Exempt specific routes (login, bootstrap, recovery-key/consume) from CSRF check

3. **`server/tests/rate-limit.test.ts`** — Tests for rate limiting behavior
   - Verify 429 response after exceeding limits
   - Verify Retry-After header present
   - Verify different IPs have separate counters

4. **`server/tests/csrf.test.ts`** — Tests for CSRF middleware
   - Verify 403 on mutating requests without CSRF token
   - Verify 403 on mismatched CSRF token
   - Verify success with matching CSRF token
   - Verify login/bootstrap/recovery-key are CSRF-exempt

### Modified Files

5. **`server/src/app.ts`** — Mount rate limiters and CSRF middleware
   - Import and apply rate limiters to auth routes
   - Import and apply CSRF middleware globally
   - Rate limiters mount BEFORE auth routes
   - CSRF middleware mounts BEFORE route handlers

6. **`server/src/routes/auth-routes.ts`** — Add CSRF token endpoint + apply rate limiters
   - Add `GET /csrf-token` route
   - Apply specific rate limiters to auth endpoints

7. **`src/services/api.ts`** — Client-side CSRF token handling
   - Add `fetchCsrfToken()` function
   - Include `X-CSRF-Token` header on mutating requests
   - On 403 with missing CSRF, re-fetch token and retry once

8. **`package.json`** — Add `express-rate-limit` dependency

9. **`server/tests/auth-routes.test.ts`** — Update existing tests
   - Ensure CSRF token is included in test requests for mutating endpoints
   - Or exempt test requests via middleware bypass

## Data Flow

```
Request → Helmet → JSON parser → Cookie parser → CSRF check → Rate limit (auth) → Route handler
```

CSRF check happens AFTER cookie parsing (needs `strata_csrf` cookie) but BEFORE route handlers.
Rate limiters are applied per-route in auth-routes, not globally.