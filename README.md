# Strata

Strata is a self-hostable, browser-based project and task management app. It combines multi-workspace boards with server-backed accounts, sessions, and role-based access controls. The client is built with React and Vite; the API runs on Node.js and Express and stores data in SQLite.

## What it does

- Organize work across workspaces and boards, with board, table, and calendar views.
- Create and manage lists and cards, including assignments, labels, comments, checklists, activity, and attachments (links and uploaded file metadata).
- Find work with search operators such as `@member`, `#label`, and `is:overdue`.
- Use archive and restore flows, board membership controls, and board-level automation rules.
- Sign in with server-managed sessions. Administrators can create users, assign roles and workspace membership, and reset passwords. Access is enforced by the API, not only by the interface.
- Install the web app in supported browsers. Browser and client boundaries are documented in the identity guide.

Strata is an active project. Features and operational guidance may change; see the source, tests, and linked guides for current detail.

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
git clone https://github.com/Zuriel-Labs/strata.git
cd strata
npm ci
npm run dev
```

The development command starts the Vite client and Node API together. Local state is persisted in SQLite under `server/data/`. Do not use the development seed account for a deployed instance.

For setup details, including the local-only seed account and reset guidance, see [Quickstart](docs/quickstart.md). For a clean unseeded installation, the first-run flow asks the operator to create the first System Administrator account. Demo seed mode (`SEED_DATA=true`) creates username `admin` with temporary password `ChangeMe123!`; the first login requires a password change. Use this seed only in a disposable local environment.

## Development checks

```bash
npm run lint
npm run test
npm run build
npm run test:e2e
```

`npm run check` runs the repository skill-alignment check, pipeline tests, and `npm run test:ci` (lint, unit/integration tests, build, and Playwright). The GitHub Actions quality workflow runs `npm ci`, installs Playwright Chromium, then runs `npm run check` for pushes to `main` and pull requests.

## Documentation

- [Project overview, stack, and feature notes](docs/README.md)
- [Quickstart and local validation flow](docs/quickstart.md)
- [Roles and permissions](docs/roles-and-permissions.html)
- [Identity, sessions, recovery, and client boundaries](docs/identity-and-clients.html)
- [RBAC validation report](docs/reports/auth-rbac-test-report.md)

The prototype in `docs/prototypes/flowboard.html` is an early design artifact, not a description of the current UI.
