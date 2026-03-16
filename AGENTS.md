# strata Development Guidelines

## Stack
TypeScript 5.9, React 19, Express, better-sqlite3, bcryptjs, Zod v4, Vite, Vitest, Playwright.

## Project Layout
- `src/` — React client (components, services, store, hooks). Path alias `@/*` → `./src/*`.
- `server/src/` — Express API (routes, db, auth, rbac, audit). SQLite DB at `server/data/`.
- `tests/e2e/` — Playwright E2E tests. `tests/contract/` — contract tests.
- `server/tests/` — server integration tests. `src/**/*.test.tsx` — client unit tests.

## Commands
- `npm run dev` — start client + server in watch mode
- `npm run test` — run vitest (unit + integration)
- `npx vitest run server/tests/admin-routes.test.ts` — run a single test file
- `npm run test:e2e` — run Playwright E2E tests
- `npm run test:ci` — lint → test → build → e2e (full CI pipeline)
- `npm run lint` — eslint

## Code Style
- ES module imports (`import`/`export`), no default exports except React components.
- Use `type` imports for type-only (`import type { Foo } from ...`).
- Zod for request validation; express routes use `safeParse` with early 400 return.
- Server tests: `// @vitest-environment node` directive at top of file.
- RBAC enforced via policy functions from `server/src/rbac/policies.ts`.
- Tailwind CSS + shadcn/ui components in `src/components/ui/`.
- Prefer `async/await`; no callbacks. Error responses: `{ message: string }`.
- Any database schema or structural change MUST ship with a startup migration path. Add or update a migration script that checks whether the live SQLite schema is behind the expected structure, applies the required fix-up in sequence during startup, and skips migration work when the database is already current.

## Active Technologies
- TypeScript 5.9 on React 19 for the client and Node.js 20+ with Express for the server + React, Vite, Express, better-sqlite3, Zod, Vitest, Testing Library (006-delete-user-workflow)
- SQLite accessed through existing repository helpers and JSON-backed card or automation columns (006-delete-user-workflow)
- TypeScript 5.9 on React 19 for the client and Node.js 20+ with Express for the server + React, Vite, Express, better-sqlite3, bcryptjs, Zod v4, Vitest, Playwright, Tailwind utility classes, shadcn/ui primitives already present in the repo (009-profile-theme-settings)
- SQLite user records and session payloads built through existing repository helpers, plus in-memory client state hydrated from authenticated session data (009-profile-theme-settings)

## Recent Changes
- 006-delete-user-workflow: Added TypeScript 5.9 on React 19 for the client and Node.js 20+ with Express for the server + React, Vite, Express, better-sqlite3, Zod, Vitest, Testing Library
