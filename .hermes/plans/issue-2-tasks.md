# Tasks: Auth Endpoint Protection — Rate Limiting & CSRF (Issue #2)

## Task 1: Install express-rate-limit
- **What**: Add `express-rate-limit` as a production dependency
- **How**: `npm install express-rate-limit` in worktree
- **Acceptance**: Package appears in `dependencies` in package.json
- **Effort**: Small

## Task 2: Create rate limit middleware
- **What**: Create `server/src/middleware/rate-limit.ts` with configured limiters
- **Details**:
  - Login limiter: 5 req/min per IP
  - Bootstrap limiter: 3 req/min per IP
  - Recovery key consume limiter: 3 req/min per IP
  - Standard handler returning 429 with `Retry-After` header
- **Acceptance**: Limiters export correctly, return 429 with proper headers
- **Effort**: Medium
- **Depends on**: Task 1

## Task 3: Create CSRF middleware
- **What**: Create `server/src/middleware/csrf.ts` with double-submit cookie pattern
- **Details**:
  - `generateCsrfToken()`: creates random hex token, sets `strata_csrf` cookie (httpOnly=false,
    sameSite=lax, path=/), returns token value
  - `csrfProtection()`: middleware that validates `X-CSRF-Token` header matches
    `strata_csrf` cookie on POST/PATCH/PUT/DELETE requests
  - Exempt: `/api/auth/login`, `/api/auth/bootstrap`, `/api/auth/recovery-key/consume`
  - Skip validation for GET/HEAD/OPTIONS requests
- **Acceptance**: CSRF middleware correctly validates and rejects
- **Effort**: Medium

## Task 4: Mount middleware in app.ts
- **What**: Wire rate limiters and CSRF middleware into the Express app
- **Details**:
  - Rate limiters applied as route-level middleware in auth-routes
  - CSRF middleware applied globally after cookie-parser, before route handlers
- **Acceptance**: Middleware executes in correct order
- **Effort**: Small
- **Depends on**: Task 2, Task 3

## Task 5: Add CSRF token endpoint to auth routes
- **What**: Add `GET /api/auth/csrf-token` route
- **Details**: Generate a new CSRF token, set cookie, return `{ csrfToken }` as JSON
- **Acceptance**: Endpoint returns token and sets cookie
- **Effort**: Small
- **Depends on**: Task 3

## Task 6: Update client apiRequest for CSRF
- **What**: Modify `src/services/api.ts` to fetch and include CSRF token
- **Details**:
  - `fetchCsrfToken()`: GET /api/auth/csrf-token, store token
  - On POST/PATCH/PUT/DELETE: include `X-CSRF-Token` header
  - On 403 response: re-fetch CSRF token and retry once
- **Acceptance**: Client includes CSRF header on mutations; handles token expiry
- **Effort**: Medium
- **Depends on**: Task 5

## Task 7: Write rate limit tests
- **What**: Create `server/tests/rate-limit.test.ts`
- **Details**:
  - Test login: 6th request in 1 min gets 429
  - Test recovery-key/consume: 4th request gets 429
  - Test bootstrap: 4th request gets 429
  - Verify Retry-After header present
  - Verify 429 body has message
- **Acceptance**: All tests pass
- **Effort**: Medium
- **Depends on**: Task 4

## Task 8: Write CSRF tests
- **What**: Create `server/tests/csrf.test.ts`
- **Details**:
  - Test POST without CSRF token returns 403
  - Test POST with mismatched CSRF token returns 403
  - Test POST with matching CSRF token succeeds
  - Test login/bootstrap/recovery-key exempt from CSRF
  - Test GET /api/auth/csrf-token returns token + sets cookie
- **Acceptance**: All tests pass
- **Effort**: Medium
- **Depends on**: Task 4

## Task 9: Update existing auth tests for CSRF
- **What**: Update `server/tests/auth-routes.test.ts` to work with CSRF middleware
- **Details**:
  - Fetch CSRF token before making mutating requests in tests
  - Or: add test-only middleware bypass
- **Acceptance**: Existing tests still pass with CSRF middleware active
- **Effort**: Medium
- **Depends on**: Task 4

## Task 10: Run full test suite and verify
- **What**: Run `npm run test` and ensure all tests pass
- **Acceptance**: Zero test failures
- **Effort**: Small
- **Depends on**: All above