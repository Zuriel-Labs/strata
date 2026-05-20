# Tasks: Production HTTP Hardening — Issue #1

## Task 1: Install helmet dependency
**Effort:** 5 min
**Acceptance Criteria:**
- `helmet` appears in `package.json` dependencies
- `npm ci` succeeds
- No type errors from `@types/helmet` (helmet ships its own types)

```bash
npm install helmet
```

## Task 2: Add trust proxy and helmet middleware to app.ts
**Effort:** 15 min
**Acceptance Criteria:**
- `app.set('trust proxy', 1)` is set before any request-handling middleware
- `helmet()` middleware added with CSP (defaultSrc 'self', scriptSrc 'self', styleSrc 'self' + 'unsafe-inline', imgSrc 'self' data:, fontSrc 'self', connectSrc 'self') and HSTS (maxAge 31536000, includeSubDomains, preload)
- Helmet runs before cookieParser and attachAuth
- TypeScript compiles without errors
- Existing tests pass

**Dependencies:** Task 1

## Task 3: Add secure cookie flag to session cookies
**Effort:** 15 min  
**Acceptance Criteria:**
- `setSessionCookie` accepts `request` as first parameter
- In production (`NODE_ENV=production`), cookie `secure: true`
- Outside production, cookie `secure: request.secure` (respects X-Forwarded-Proto via trust proxy)
- `createUserSession` signature updated to include `request`
- All callers of `createUserSession` and `setSessionCookie` updated
- TypeScript compiles without errors
- Existing tests pass

**Dependencies:** Task 2 (trust proxy must be in place for req.secure to work)

## Task 4: Fix logout handler session cookie name inconsistency
**Effort:** 10 min
**Acceptance Criteria:**
- Logout handler uses `SESSION_COOKIE` constant instead of hardcoded `'strata_session'`
- Import `SESSION_COOKIE` from `../auth/session` in auth-routes.ts
- TypeScript compiles without errors
- Existing tests pass

**Dependencies:** None (independent of Tasks 2-3)

## Task 5: Add integration tests for security hardening
**Effort:** 20 min
**Acceptance Criteria:**
- Test: response includes `X-Content-Type-Options: nosniff` header
- Test: response includes `Strict-Transport-Security` header  
- Test: response includes `X-Frame-Options: DENY` header
- Test: session cookie has `Secure` flag in production environment
- Test: session cookie works without Secure flag in development environment
- Test: logout correctly clears the cookie using SESSION_COOKIE constant
- All existing 143 tests still pass
- All new tests pass

**Dependencies:** Tasks 2, 3, 4

## Task 6: Final verification — full test suite + typecheck + lint
**Effort:** 10 min
**Acceptance Criteria:**
- `npm run test` passes (all tests)
- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` succeeds

**Dependencies:** Tasks 1-5