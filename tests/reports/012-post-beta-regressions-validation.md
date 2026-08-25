# Validation Report: Post-Beta Consistency and Drag Reliability

**Date**: 2026-08-25
**Branch**: `fix/post-beta-regressions`
**Issues**: #23, #24, #25, #26
**Status**: Local implementation validated; exact-commit PR and canary evidence pending

## Acceptance Evidence

| Issue | Acceptance outcome | Automated evidence |
|---|---|---|
| #23 | One date-only value is used by edit, badge, table, calendar, filter, and search surfaces; legacy ISO values remain readable | Pure boundary tests, modal save regression, and Playwright in `America/Los_Angeles`, `UTC`, and `Pacific/Auckland` |
| #24 | Workspace and board hydrate as one valid pair; an intentional null board remains null for an empty workspace | Reducer/helper tests and a browser test spanning the five-second automatic refresh |
| #25 | The active card or lane is the single explicit faded placeholder at its projected destination; final persistence uses the same preview order | Pure 100-event retention test plus pointer, touch, reduced-motion, rollback, third-card, and refresh browser tests |
| #26 | Automations exposes labeled Workspace and Board selectors, filters both through existing authorization, and reconciles board/form context | Component role/scope regression plus browser panel-switch acceptance and unchanged server RBAC suite |

## Red-Green Record

The first focused run failed for the expected reasons before implementation:

- missing date-only, navigation-selection, and drag-preview modules;
- empty-workspace hydration restored `b1` from another workspace;
- the Automation workspace selector did not exist;
- the card modal did not save a canonical date-only value.

After implementation, the focused suite passed 7 files / 78 tests. The strengthened pure suite later passed 13 tests and targeted Playwright passed 13 workflows.

## Full Validation

- `npm audit --audit-level=high`: 0 vulnerabilities
- SQLite `PRAGMA integrity_check`: `ok`
- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm run build`: pass
- `npm run test:ci`: pass
  - Vitest: 33 files / 255 tests
  - Playwright: 17 tests
- `git diff --check`: pass

The Vite build retains its pre-existing informational warning that the main JavaScript chunk exceeds 500 kB. No endpoint, schema, migration, dependency, or production configuration was added for these fixes.

## Deployment Boundary

This candidate is for canary only. Production remains pinned to the previously approved source/image until a later explicit approval. Canary rollback is the prior approved tag `canary-da29d57-20260825` and digest `sha256:b4715a878bd9a3674390c1c44f74f9880abf4130d5cde4b7d8f03cb1e979c528`.
