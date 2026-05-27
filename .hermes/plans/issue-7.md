# Plan: Issue #7 — Security: Reduce attack surface

## Files Changed

### 1. `server/src/app.ts`
- Remove `const JSON_BODY_LIMIT = '12mb'` constant
- Change `app.use(express.json({ limit: JSON_BODY_LIMIT }))` → `app.use(express.json({ limit: '1mb' }))`
- Add `import cors from 'cors'`
- Add `app.use(cors({ origin: getCorsOrigin(), credentials: true }))` after helmet
- Implement `getCorsOrigin()` helper: if `CORS_ORIGIN` env var set, return that string; otherwise return `false`

### 2. `server/src/routes/auth.ts`
- Add `import express from 'express'`
- At top of router setup: `router.use(express.json({ limit: '100kb' }))`

### 3. `Dockerfile`
- Change `FROM node:22-bookworm AS builder` → `FROM node:22-bookworm-slim AS builder`
- Add `RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*`

### 4. `server/src/seed/bootstrap.ts`
- Add `import { randomBytes } from 'crypto'`
- Replace hardcoded admin/user passwords with:
  ```
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || randomBytes(16).toString('base64')
  // For seed user:
  const seedPassword = process.env.SEED_USER_PASSWORD || randomBytes(16).toString('base64')
  ```
- After seeding, `console.log('Seed admin password:', adminPassword)`
- Same for user if `SEED_USER_PASSWORD` not set

### 5. `server/src/types/env.d.ts` (if exists) or create inline `process.env` typing
- Add `CORS_ORIGIN?: string` and `ADMIN_INITIAL_PASSWORD?: string` and `SEED_USER_PASSWORD?: string`

### 6. `package.json` + `package-lock.json`
- `npm install cors` + `@types/cors`

## New Files
None.

## Data Flow
- CORS middleware runs early in request pipeline; `origin: false` rejects cross-origin preflight
- Auth route JSON limiter overrides global 1mb with 100kb only for auth router
- Seed bootstrap reads env at startup; falls back to crypto random bytes
- Docker builder installs build tools only in builder stage, not runtime

## Test Plan
- `npm run lint` — must pass with no new errors
- `npm run typecheck` — must pass
- `npm run test` — all existing tests pass
- Verify no hardcoded passwords remain: `grep -n "ChangeMe" server/src/seed/bootstrap.ts` should return nothing
