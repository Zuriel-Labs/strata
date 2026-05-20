# Plan: Production HTTP Hardening — Issue #1

## Files Changed

### 1. `server/src/app.ts` — Add trust proxy + Helmet middleware

**Changes:**
- Add `import helmet from 'helmet';` at top
- Add `app.set('trust proxy', 1);` before middleware chain
- Add `app.use(helmet({...}));` with CSP and HSTS config after trust proxy
- Helmet must come BEFORE cookie-parser and other middleware to ensure all responses get security headers

**Order of middleware in createApp():**
```
1. express.json()
2. helmet({ contentSecurityPolicy, hsts })  ← NEW
3. cookieParser()
4. attachAuth(db)
5. routes...
```

### 2. `server/src/auth/session.ts` — Secure cookie flag

**Changes:**
- Import `Request` type from express (already imports `Response`)
- Modify `setSessionCookie()` to accept `request` as first parameter
- Set `secure` flag dynamically:
  - `NODE_ENV === 'production'` → `true`
  - `NODE_ENV !== 'production'` → `request.secure` (respects X-Forwarded-Proto via trust proxy)

**Updated signature:**
```typescript
export function setSessionCookie(request: Request, response: Response, sessionId: string) {
```

### 3. `server/src/auth/session.ts` — Update `createUserSession` signature

**Changes:**
- Add `request: Request` parameter to `createUserSession`
- Pass request through to `setSessionCookie`

**Updated signature:**
```typescript
export function createUserSession(db: Database.Database, userId: string, request: Request, response: Response) {
```

### 4. `server/src/routes/auth-routes.ts` — Fix cookie name + pass request

**Changes:**
- Line ~138: Replace `request.cookies?.strata_session` with `request.cookies?.[SESSION_COOKIE]`
- Import `SESSION_COOKIE` from auth/session
- Pass `request` to all `createUserSession()` calls:
  - Bootstrap handler: `createUserSession(db, id, request, response)`
  - Login handler: `createUserSession(db, user.id, request, response)`

### 5. `package.json` — Add helmet dependency

**Changes:**
- Add `helmet` to dependencies

### 6. `server/tests/auth-routes.test.ts` — Update tests for new signatures

**Changes:**
- Update any tests that directly call `createUserSession` if applicable
- Add test for secure cookie flag behavior
- Add test for SESSION_COOKIE usage in logout

## New Files

None — all changes are to existing files.

## Data Flow

```
Request → [helmet headers] → [cookie parser] → [auth middleware] → [route handlers]
                                    ↑
                    setSessionCookie now reads request.secure
                    (trust proxy feeds X-Forwarded-Proto → req.secure)
```