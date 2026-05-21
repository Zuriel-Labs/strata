# Spec — Issue #6: Quality: Fix test environment

## Goal
Restore test suite reliability by resolving two environment-level blockers (better-sqlite3 Node 26 incompatibility and jsdom localStorage absence) and clean up known dependency vulnerabilities.

## Users
- CI/CD pipeline (automated test gate)
- Developers running `npm run test` locally

## Data Model / Changes
- `package.json` — dependency version bumps and removals
- `package-lock.json` — regenerated
- `src/test/setup.ts` — localStorage polyfill for jsdom

## Views & Navigation
- N/A — no UI changes

## API / Data Flow
- N/A — no API changes

## Edge Cases
1. better-sqlite3 v12.10.0 may still fail on a different Node ABI — verified via `npm run test`.
2. jsdom does not implement `localStorage` natively; must polyfill before any test imports it.
3. `html-inline` removal must not break any build or dev script.

## v1 Scope (IN)
- [IN] Upgrade `better-sqlite3` to v12.10.0+ (Node 26 compatible)
- [IN] Add localStorage polyfill to `src/test/setup.ts`
- [IN] Run `npm audit fix` to auto-resolve vulnerabilities
- [IN] Remove unused `html-inline` devDependency
- [IN] Verify all 143 unit/integration tests pass
- [IN] Verify `npm run typecheck` passes
- [IN] Verify `npm run lint` passes

## v1 Scope (OUT)
- [OUT] `path-to-regexp` ReDoS — production dep via Express 5, no patch available yet
- [OUT] Playwright E2E tests (not part of the failing 143)
- [OUT] Upgrading all 29 outdated packages

## Open Questions
- None — issue body provides exact fix steps.
