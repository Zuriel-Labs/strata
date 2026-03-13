# Quickstart: Server-Backed Auth and RBAC

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
npm install
```

## Run the app locally

```bash
npm run dev
```

This starts the Vite frontend and the Node API together for local development.

## Seed bootstrap account

On first run, the backend creates a SQLite database and seeds a bootstrap system administrator account.

- Email: `admin@strata.local`
- Password: `ChangeMe123!`

The first successful login requires a password change.

## Validation flow

1. Sign in with the bootstrap administrator account.
2. Change the temporary password when prompted.
3. Open the admin area.
4. Create a new user and assign workspace membership.
5. Trigger a password reset for that user.
6. Sign in as the new user and confirm only assigned workspaces and boards are available.

## Test commands

```bash
npm run lint
npm run test
npm run build
```

## Data reset

Delete the SQLite file under `server/data/` and restart the dev server to reseed a fresh local environment.
