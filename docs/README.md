# Strata

Strata is a React + Vite visual project management app with a lightweight Node backend, SQLite persistence, session authentication, RBAC, and a protected system-admin user management flow.

## Documentation Map

- Quickstart: `docs/quickstart.md`
- Roles and permissions: `docs/roles-and-permissions.html`
- Latest RBAC validation report: `docs/reports/auth-rbac-test-report.md`
- Prototype artifact: `docs/prototypes/flowboard.html`

## Stack

- React 19
- TypeScript
- Express
- SQLite via `better-sqlite3`
- bcryptjs session auth
- Vite 8
- Tailwind CSS
- Radix UI primitives

## Getting Started

Requirements:

- Node.js 20+
- npm

Install dependencies:

```bash
npm install
```

Start the frontend and backend together:

```bash
npm run dev
```

Start only the API server:

```bash
npm run server:dev
```

Build for production:

```bash
npm run build
```

Run linting:

```bash
npm run lint
```

Run the unit and integration suite:

```bash
npm run test
```

Run the Playwright end-to-end flow:

```bash
npm run test:e2e
```

Run the full local CI pipeline:

```bash
npm run test:ci
```

Preview the production build:

```bash
npm run preview
```

## Project Structure

- `server/src/` contains the Express API, SQLite schema/bootstrap logic, auth flows, and RBAC helpers
- `src/App.tsx` wires authenticated app gating, view switching, and admin panel access
- `src/components/` contains layout, board UI, modal flows, and reusable primitives
- `src/data.ts` provides the seeded demo content imported into the backend bootstrap
- `src/store.tsx` manages board state once an authenticated server snapshot is loaded

## Current Features

- Email/password sign-in with server-managed sessions
- Forced password change for bootstrap or reset credentials
- Seeded `system_admin` bootstrap user and SQLite persistence
- Protected admin panel for user creation, role assignment, memberships, and password resets
- API-level authorization for authenticated session, admin, and authorized bootstrap routes
- Multi-board workspace navigation
- Board, table, and calendar task views
- Card detail modal with activity, checklist, and assignment data
- Search overlay with operators such as `@member`, `#label`, and `is:overdue`
- Archive restore/delete controls for cards and lists
- Attachments for links and uploaded file metadata
- Mention-aware comments and assignment notifications
- Authorized workspace and board bootstrap from the server
- Automation side panel with board-level rules

## Notes

- First-run bootstrap admin credentials:
  - Email: `admin@strata.local`
  - Password: `ChangeMe123!`
- The bootstrap admin must rotate the temporary password on first sign-in
- GitHub Actions runs linting, Vitest, production build, and Playwright smoke coverage on every push and pull request
- Local logs, build output, dependencies, coverage artifacts, SQLite data files, and environment files are ignored through `.gitignore`

## Documentation Convention

- User-facing and project-reference documentation should live under `docs/`
- Internal automation/config files such as `AGENTS.md` and `.specify/` remain outside `docs/` because tooling depends on those locations
