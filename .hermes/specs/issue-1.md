# Spec: Production HTTP Hardening — Session Cookies, Helmet, and Trust Proxy

**Issue:** Broville/strata#1
**Priority:** P0 — Critical
**Status:** In Progress

---

## Goal

Secure the Express server for production deployment behind a reverse proxy by:
1. Enabling secure session cookies in production
2. Adding trust proxy configuration so Express respects forwarded headers
3. Adding Helmet middleware with CSP and HSTS
4. Fixing inconsistent session cookie name usage in the logout handler

## Users

- **Operators**: Deploy Strata behind TLS-terminating reverse proxies (Traefik/ingress)
- **End users**: Expect their session cookies to be protected in transit
- **Auditors**: Require security headers (CSP, HSTS, X-Frame-Options, etc.)

## Data Model

No database changes. This is a middleware and configuration change only.

New dependency:
- `helmet` — Express security headers middleware (production dependency)

## Views & Navigation

No UI changes. All changes are server-side middleware.

## API/Data Flow

```
Client → (TLS) → Reverse Proxy → (HTTP + X-Forwarded-*) → Express

Changes:
1. Express trusts the first proxy hop (trust proxy = 1)
2. Session cookie: secure=true in production (set when X-Forwarded-Proto=https or NODE_ENV=production)
3. Helmet adds security headers to every response
4. Logout handler reads session cookie using SESSION_COOKIE constant
```

### Session Cookie Secure Logic

```
secure flag = 
  if NODE_ENV === 'production' → true
  else if X-Forwarded-Proto === 'https' → true  
  else → false
```

With `trust proxy` enabled, Express's `req.secure` reflects `X-Forwarded-Proto`, so we can use `req.secure` as the dynamic check in development while defaulting to `true` in production.

### Helmet Configuration

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Tailwind CSS requires inline styles
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000,     // 1 year
    includeSubDomains: true,
    preload: true,
  },
}));
```

Note: `styleSrc` includes `'unsafe-inline'` because Tailwind CSS generates inline styles. This is a known tradeoff documented in the spec.

## Edge Cases

1. **Development without reverse proxy**: `secure: false` so cookies work over localhost HTTP
2. **Canary deployment**: Behind ingress with TLS termination — `secure: true` should work
3. **Custom session cookie name**: `STRATA_SESSION_COOKIE` env var; all code must use the `SESSION_COOKIE` constant
4. **CSP vs inline styles**: Tailwind requires `'unsafe-inline'` in `styleSrc` — this is acceptable for v1
5. **HSTS with canary**: Canary domain uses ingress TLS; HSTS is appropriate
6. **Health check endpoint**: Helmet headers shouldn't break `/api/health`

## v1 Scope (IN)

- Set `secure: true` for session cookies in production
- Set `app.set('trust proxy', 1)` in `createApp()`
- Add `helmet` middleware with CSP and HSTS
- Fix logout handler to use `SESSION_COOKIE` constant
- Add `helmet` as a production dependency

## Out of Scope (OUT)

- Refactoring the entire auth/session system
- Adding nonce-based CSP (future enhancement)
- Custom Helmet configurations per route
- Changing the client-side code

## Open Questions

- None — the issue is well-specified with concrete files and fixes