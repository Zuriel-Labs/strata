# AGENTS.md — strata

This file provides instructions for autonomous agents working on this repository.

## Project Context

- **Org**: Broville
- **Repo**: strata
- **Project**: Strata
- **Deploy Stage**: Canary (strata-canary.eaglepass.io)
- **Stack**: TypeScript 5.9, React 19, Express 5, better-sqlite3, Zod v4, Vite, Vitest, Playwright

## Commands

- `npm run dev` — start client + server in watch mode
- `npm run typecheck` — TypeScript type checking (`tsc -b`)
- `npm run lint` — ESLint
- `npm run test` — run vitest (unit + integration)
- `npm run test:e2e` — run Playwright E2E tests
- `npm run test:ci` — lint → test → build → e2e (full CI pipeline)
- `npm run build` — typecheck + build client + server

## Project Layout

- `src/` — React client (components, services, store, hooks). Path alias `@/*` → `./src/*`
- `server/src/` — Express API (routes, db, auth, rbac, audit). SQLite DB at `server/data/`
- `tests/e2e/` — Playwright E2E tests. `tests/contract/` — contract tests.
- `server/tests/` — server integration tests. `src/**/*.test.tsx` — client unit tests.

## Pipeline

This repo is managed by the **broville-pipeline** skill. When an issue is assigned:

1. Claim the issue (apply `agent:working` label, set `claimed_at` to unix timestamp)
2. Work in an isolated worktree from `origin/main` — NEVER in the main checkout
3. Push a branch, open a PR against `main`
4. Mark `agent:canary` when deployed to canary
5. Mark `agent:awaiting-feedback` when ready for human review
6. Close the issue after validation

### Canary Deployment

- **Canary domain**: `strata-canary.eaglepass.io`
- **Canary namespace**: `strata-canary`
- **Registry**: `10.0.20.11:32309` (cluster pull address)
- **Helm chart**: `~/git-clones/homelab/apps/strata-canary/` (Gitea: `git.eaglepass.io/ops/homelab`)
- **Build**: `podman build` from worktree, push with `--tls-verify=false`
- **Deploy**: Update image tag in `values.yaml`, push to Gitea, ArgoCD auto-syncs

⚠️ **NEVER deploy to production without explicit Discord approval.**
⚠️ **Homelab changes go to Gitea** (`git.eaglepass.io/ops/homelab`), NOT GitHub. ArgoCD watches Gitea.

## Conventions

- **Branch naming**: `feat/<short-description>` or `fix/<short-description>`
- **Commit style**: Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)
- **PRs**: Require 1 approval; stale reviews are dismissed
- **Issues**: Use the YAML form templates; do not create blank issues
- ES module imports (`import`/`export`), no default exports except React components
- Use `type` imports for type-only (`import type { Foo } from ...`)
- Zod for request validation; express routes use `safeParse` with early 400 return
- RBAC enforced via policy functions from `server/src/rbac/policies.ts`
- Tailwind CSS + shadcn/ui components in `src/components/ui/`

## Discord

- **Channel**: #strata
- **Origin thread**: Used for autopilot issue tracking
- Labels `discord:thread` and `discord:last` track sync state

## Labels Reference

| Label                   | Color   | Purpose                                    |
|-------------------------|---------|--------------------------------------------|
| `priority:critical`    | #B60205 | Blocks core functionality                  |
| `priority:high`        | #D93F0B | Pick up before medium/low                  |
| `priority:medium`      | #FBCA04 | Default priority                           |
| `agent:working`        | #5319E7 | Agent claimed, actively working             |
| `agent:canary`         | #1D76DB | Deployed to canary for validation          |
| `agent:awaiting-feedback` | #0E8A16 | Waiting for human validation             |
| `claimed_at`           | #6B6B6B | Unix timestamp when issue was claimed      |
| `discord:thread`       | #8E44AD | Discord thread ID for this issue           |
| `discord:last`          | #27AE60 | Last Discord message ID seen by agent      |

## Reports

All briefs, reports, and status updates are published to **pages.eaglepass.io** using the Liquid Glass design system (dark mode, self-contained HTML, no `.glass::before` overlay).