# Implementation Plan: Core Platform Overhaul

**Branch**: `003-core-platform` | **Date**: 2026-03-13 | **Spec**: `specs/003-core-platform/spec.md`

## Summary

Transform Strata from a demo-seeded MVP into a production-ready, self-bootstrapping platform. This involves removing seed data from production startup, migrating identity from email to username, implementing first-run admin bootstrap wizard, adding self-service password recovery via recovery keys, enforcing confirm-password on all password flows, aligning RBAC to the desired permission matrix (removing Guest role), refactoring the admin panel into sub-menus with isolated state, adding server-persisted workspace creation, and improving UX with overlay menus and touch-friendly targets.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 20+ and React 19
**Primary Dependencies**: Express, better-sqlite3, bcryptjs, zod, React, Vite, Vitest, Playwright
**Storage**: SQLite database file
**Testing**: Vitest for unit and integration tests, Playwright for E2E
**Target Platform**: Linux/macOS developer workstations and Node-hosted web deployments
**Project Type**: web
**Performance Goals**: Auth endpoints p95 under 200ms; bootstrap check under 50ms
**Constraints**: No email infrastructure; preserve existing board UX; keep SQLite-based persistence; maintain backward compatibility for session handling
**Scale/Scope**: MVP multi-user platform, tens to low hundreds of users

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| Spec-First Development | PASS | Spec 003 created before implementation |
| Test-Driven Quality | PASS | All existing tests will be updated; new tests for recovery, bootstrap, permissions |
| Constitution Alignment | PASS | All changes map to spec requirements |
| Iterative Refinement | PASS | Work organized in foundation → core → polish phases |
| Documentation as Code | PASS | Data model, contracts, tasks all maintained |

## Phase 0: Research

### Decision 1: Email → Username Migration Strategy
**Decision**: Rename `email` column to `username` in SQLite schema via `ALTER TABLE RENAME COLUMN`. Update all references across server types, routes, repositories, and frontend.
**Rationale**: SQLite supports `ALTER TABLE RENAME COLUMN` since 3.25.0. This is cleaner than creating a new column and migrating data.
**Alternatives Considered**: Add `username` column alongside `email` (rejected — unnecessary complexity for fresh-install focus).

### Decision 2: Recovery Key Format
**Decision**: Generate 32-byte random hex strings as recovery keys. Store bcrypt hash in `recovery_keys` table.
**Rationale**: Hex is unambiguous to read/type. 32 bytes provides 256 bits of entropy. Bcrypt prevents offline brute-force if DB is compromised.
**Alternatives Considered**: UUID format (rejected — hyphens make manual entry harder), base64 (rejected — ambiguous characters).

### Decision 3: Seed Data Strategy
**Decision**: Wrap seed data call behind `SEED_DATA=true` environment variable. Production default is no seeding. Tests explicitly call seed when needed.
**Rationale**: Clean separation between test and production data. Tests already pass `':memory:'` and can explicitly seed.
**Alternatives Considered**: Separate seed script (rejected — current bootstrap.ts pattern works well, just needs gating).

### Decision 4: Admin Panel Architecture
**Decision**: Use React state-driven tabs within AdminPanel component. Each sub-view is a separate child component with its own local state.
**Rationale**: Simple, no routing needed. State isolation comes naturally from component unmounting.
**Alternatives Considered**: React Router nested routes (rejected — over-engineering for a panel with 3 views).

## Phase 1: Design & Contracts

### Data Model
See `specs/003-core-platform/data-model.md`.

### API Contracts
See `specs/003-core-platform/contracts/`.

## Project Structure

No structural changes to the repository layout. Changes are within existing `server/src/` and `src/` directories.

### Modified Files

```
server/src/
├── types.ts                    # email → username, remove guest roles
├── db/
│   ├── schema.ts               # email → username column, add recovery_keys table
│   ├── database.ts             # gate seed behind env var
│   ├── repositories.ts         # email → username queries
│   └── admin-repositories.ts   # email → username queries
├── auth/
│   ├── session.ts              # email → username in responses
│   └── passwords.ts            # (unchanged)
├── rbac/
│   ├── permissions.ts          # remove guest from role checks
│   └── policies.ts             # (unchanged)
├── routes/
│   ├── auth-routes.ts          # username login, bootstrap, recovery endpoints
│   ├── admin-routes.ts         # username references
│   └── bootstrap-routes.ts     # username in bootstrap response
├── seed/
│   └── bootstrap.ts            # email → username in seed data

src/
├── types.ts                    # email → username in frontend types
├── lib/auth-context.tsx        # username in auth context
├── services/
│   ├── session.ts              # username in login
│   └── admin.ts                # username in admin API
├── components/
│   ├── AuthScreen.tsx          # username field, bootstrap wizard, forgot password
│   ├── AdminPanel.tsx          # sub-menu refactor
│   ├── Sidebar.tsx             # workspace creation, overlay
│   ├── Header.tsx              # touch targets
│   └── (other components)      # touch target adjustments

server/tests/                   # all tests updated
src/*.test.tsx                  # all tests updated
```

## Complexity Tracking

No constitution exceptions required.
