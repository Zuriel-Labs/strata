# Implementation Plan: Profile Theme Settings

**Branch**: `009-profile-theme-settings` | **Date**: 2026-03-16 | **Spec**: `specs/009-profile-theme-settings/spec.md`

## Summary

Add a stronger dark-default palette, introduce a light theme option, and replace the simple profile menu with a structured account overlay that supports Profile, Preferences, Security, and Sign Out. The work spans frontend theming and overlay UX, self-service auth APIs for profile and preference updates, a SQLite-backed theme preference migration, and focused client/server/E2E regression coverage.

## Technical Context

**Language/Version**: TypeScript 5.9 on React 19 for the client and Node.js 20+ with Express for the server
**Primary Dependencies**: React, Vite, Express, better-sqlite3, bcryptjs, Zod v4, Vitest, Playwright, Tailwind utility classes, shadcn/ui primitives already present in the repo
**Storage**: SQLite user records and session payloads built through existing repository helpers, plus in-memory client state hydrated from authenticated session data
**Testing**: Vitest for client and server regressions; Playwright for authenticated account-menu flows; existing auth tests for password-change coverage
**Target Platform**: Browser-based web application with desktop, keyboard, and touch interactions
**Project Type**: web
**Performance Goals**: Theme switching and account-overlay navigation feel immediate, with no full-page reload required for profile or preference changes
**Constraints**: Preserve dark mode as the default, improve accessibility contrast across existing surfaces, add a startup-safe SQLite migration for any schema change, keep sign-out and password-change behavior aligned with existing auth flows, and avoid regressing current header/navigation interactions
**Scale/Scope**: One authenticated settings surface affecting the main app shell, the current user session payload, user persistence, and a small set of self-service endpoints

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| Spec-First Development | PASS | Spec 009 defines the UX, preference, and security behaviors before code changes |
| Test-Driven Quality | PASS | Plan includes client, server, and E2E coverage for the new menu, persistence, and password-change flows |
| Constitution Alignment | PASS | Planned work stays inside theming and self-service account settings without introducing unrelated platform changes |
| Iterative Refinement | PASS | Work is split into theme infrastructure, account-overlay flows, backend persistence, and regression validation |
| Documentation as Code | PASS | Spec, plan, research, data model, contracts, quickstart, and tasks are created together |

## Phase 0: Research

### Decision 1: Persist theme preference on the user record
**Decision**: Store the signed-in user's theme preference alongside existing self-managed user fields instead of only in client-local storage.
**Rationale**: The request places theme selection under account preferences, and server-backed persistence allows the preference to survive refreshes and future sessions consistently.
**Alternatives Considered**: Browser-local storage only (rejected - would not follow the requested user-profile behavior and would drift across devices or sessions).

### Decision 2: Add dedicated self-service update routes under auth
**Decision**: Introduce authenticated self-service routes for profile updates and preference updates while reusing the existing password-change and logout routes.
**Rationale**: Current editable name, initials, and color behavior exists only in admin-only routes; self-service account settings need their own validation and audit-safe path.
**Alternatives Considered**: Reuse the admin user patch endpoint for self-service updates (rejected - wrong authorization model and unnecessarily broad payload surface).

### Decision 3: Expand the existing profile overlay into a stacked account-settings overlay
**Decision**: Evolve the current top-right `ProfileOverlay` into a menu plus sub-overlay experience with consistent back and close controls instead of introducing a separate page.
**Rationale**: The requested interaction is explicitly overlay-based, and the header already owns the trigger and current menu entry point.
**Alternatives Considered**: Add a full-screen settings route (rejected - conflicts with the requested overlay flow and adds navigation complexity).

## Phase 1: Design & Contracts

### Data Model
See `specs/009-profile-theme-settings/data-model.md`.

### API Contracts
See `specs/009-profile-theme-settings/contracts/account-settings.openapi.yaml`.

### Quickstart
See `specs/009-profile-theme-settings/quickstart.md`.

## Project Structure

No repository restructuring is required. The feature fits into the existing frontend `src/` app, backend `server/src/` auth and repository layers, and the current Vitest or Playwright test suites.

### Modified Files

```text
src/
├── App.tsx
├── App.auth.test.tsx
├── components/
│   ├── Header.tsx
│   └── ProfileOverlay.tsx
├── lib/
│   └── auth-context.tsx
├── services/
│   └── session.ts
├── index.css
└── types.ts

server/
├── src/
│   ├── db/
│   │   ├── repositories.ts
│   │   └── schema.ts
│   └── routes/
│       └── auth-routes.ts
└── tests/
    └── auth-routes.test.ts

tests/
└── e2e/
    └── app.spec.ts
```

**Structure Decision**: Use the existing split repository structure with frontend code in `src/`, Express or SQLite logic in `server/src/`, and focused regressions in existing client, server, and E2E test files.

## Complexity Tracking

No constitution exceptions required.
