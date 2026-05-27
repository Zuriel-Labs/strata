# Spec: Issue #7 — Security: Reduce attack surface

## Goal
Apply four low-priority security hardening items identified in the security audit findings #11–14 to reduce attack surface for the Strata kanban application.

## Users
- **Operators** deploying the app (Docker change benefits CI/build time)
- **Admins** who rely on correct CORS and body-size policies
- **Developers** using seed data (no longer exposed to hardcoded passwords)
- **End users** indirectly protected from DoS and credential leaks

## Data Model
No schema changes. Only configuration constants:
- `JSON_BODY_LIMIT` → replaced with inline `{ limit: '1mb' }`
- `CORS_ORIGIN` env var introduced
- `ADMIN_INITIAL_PASSWORD` env var introduced (fallback to random)

## API / Data Flow

### Body Size
- `express.json({ limit: '12mb' })` at `server/src/app.ts:15` → `'1mb'` global
- Auth router (`server/src/routes/auth.ts`) adds `'100kb'` via `router.use(express.json({ limit: '100kb' }))`
- Auth endpoints (`/login`, `/register`, `/logout`, `/refresh`) get stricter limit

### CORS
- Install `cors` package
- `app.use(cors({ origin: process.env.CORS_ORIGIN || false, credentials: true }))`
- `origin: false` in Express CORS = same-origin only (blocks all cross-origin)
- `credentials: true` preserves cookie/credential passing on allowed origins

## Views & Navigation
No UI changes.

## Edge Cases
- **CORS_ORIGIN = empty string** → `false` (same-origin only)
- **CORS_ORIGIN = comma-separated** → unsupported for v1; only single URL or `false`
- **Admin seed with missing env var** → generate random 21-char base64 password and log it
- **Podman CI with slim builder** → must verify `better-sqlite3` compiles successfully

## v1 Scope (IN)
1. Reduce global JSON body limit to 1MB
2. Apply 100KB per-route limit on auth routes
3. Add explicit CORS middleware with env-driven allowlist
4. Switch Dockerfile builder stage to `node:22-bookworm-slim` + build-essential
5. Generate random or env-provided admin seed password + log it

## Out of Scope (OUT)
- Helm values changes (not needed for this issue)
- Helm Chart.lock drift
- Security audit findings outside #11–14
- HSTS / CSP headers (separate concern)

## Open Questions
None — issue is self-contained.
