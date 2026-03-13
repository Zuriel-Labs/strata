# Strata

Strata is a React + Vite visual project management MVP with board, table, and calendar views. It ships with seeded demo data for workspaces, boards, cards, notifications, archive flows, and automation rules, then persists user changes in local storage.

## Stack

- React 19
- TypeScript
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

Start the dev server:

```bash
npm run dev
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

- `src/App.tsx` wires the main application shell and view switching
- `src/components/` contains layout, board UI, modal flows, and reusable primitives
- `src/data.ts` provides seeded demo data for the prototype
- `src/store.tsx` manages application state through the shared provider

## Current Features

- Multi-board workspace navigation
- Board, table, and calendar task views
- Card detail modal with activity, checklist, and assignment data
- Search overlay with operators such as `@member`, `#label`, and `is:overdue`
- Archive restore/delete controls for cards and lists
- Attachments for links and uploaded file metadata
- Mention-aware comments and assignment notifications
- Local persistence across reloads
- Automation side panel with board-level rules

## Notes

- Seed data initializes the app, and changes are then stored in browser local storage
- GitHub Actions runs linting, Vitest, production build, and Playwright smoke coverage on every push and pull request
- Local logs, build output, dependencies, coverage artifacts, and environment files are ignored through `.gitignore`
