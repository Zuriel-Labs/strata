# Strata

Strata is a React + Vite project management interface prototype with board, table, and calendar views. It ships with seeded demo data for workspaces, boards, cards, notifications, and automation rules.

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
- Search overlay and automation side panel
- Seeded team/project data for local exploration

## Notes

- This repository currently uses in-memory demo data and does not persist changes
- Local logs, build output, dependencies, and environment files are ignored through `.gitignore`
