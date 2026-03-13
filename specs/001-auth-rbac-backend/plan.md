# Implementation Plan: Server-Backed Auth and RBAC

**Branch**: `001-auth-rbac-backend` | **Date**: 2026-03-13 | **Spec**: `specs/001-auth-rbac-backend/spec.md`
**Input**: Feature specification from `specs/001-auth-rbac-backend/spec.md`

## Summary

Move Strata from client-only seeded/local state to a lightweight Node API with SQLite-backed persistence, session authentication, API-level RBAC checks, and an admin experience for user, membership, and password lifecycle management. The frontend will hydrate from authenticated server state, expose protected admin screens, and surface server-enforced access denials instead of assuming trust in browser state.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 20+ and React 19  
**Primary Dependencies**: Express, better-sqlite3, bcryptjs, zod, React, Vite, Vitest, Playwright  
**Storage**: SQLite database file with seeded bootstrap data  
**Testing**: Vitest for unit and integration tests, Playwright for authenticated UI smoke coverage  
**Target Platform**: Linux/macOS developer workstations and Node-hosted web deployments  
**Project Type**: web  
**Performance Goals**: Auth/session endpoints p95 under 200 ms locally; authorized board bootstrap under 500 ms for seeded datasets  
**Constraints**: No email infrastructure; password resets must be admin-triggered; preserve existing Strata board UX for authorized users; keep setup simple enough for local development with a single SQLite file  
**Scale/Scope**: MVP multi-user collaboration platform for tens to low hundreds of users, a few workspaces per deployment, and role-scoped board administration

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| Spec-First Development | PASS | Spec created before implementation. |
| Test-Driven Quality | PASS | Plan includes backend auth/RBAC tests plus protected UI smoke coverage. |
| Constitution Alignment | PASS | Auth, RBAC, audit, and admin flows are mapped to specification artifacts and tests. |
| Iterative Refinement | PASS | Work is split into foundation, admin, scoped authorization, and validation phases. |
| Documentation as Code | PASS | Research, data model, contracts, quickstart, tasks, and test reports are part of deliverables. |

## Phase 0: Research

Key technical decisions are recorded in `specs/001-auth-rbac-backend/research.md`:

1. Use Express rather than a heavier full-stack framework to keep the backend small and incremental.
2. Use `better-sqlite3` for simple local persistence and deterministic tests.
3. Use signed cookie session IDs stored server-side in SQLite-backed session tables rather than JWTs to support forced revocation and role updates.
4. Keep the frontend in the existing `src/` app and add a `server/` area instead of a full frontend/backend monorepo restructure.

## Phase 1: Design & Contracts

### Data Model

Detailed entity, relationship, and lifecycle definitions live in `specs/001-auth-rbac-backend/data-model.md`.

### API Contracts

OpenAPI-style contracts for auth, admin, and authorized workspace bootstrap endpoints live in `specs/001-auth-rbac-backend/contracts/openapi.yaml`.

### Quickstart

Local setup, seed login, and validation steps live in `specs/001-auth-rbac-backend/quickstart.md`.

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-rbac-backend/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
├── checklists/
│   ├── requirements.md
│   └── security.md
└── tasks.md
```

### Source Code (repository root)

```text
server/
├── src/
│   ├── auth/
│   ├── db/
│   ├── http/
│   ├── rbac/
│   ├── routes/
│   └── seed/
├── data/
└── tests/

src/
├── components/
├── lib/
├── services/
├── test/
└── types.ts

tests/
├── contract/
└── reports/
```

**Structure Decision**: Keep the current Vite frontend rooted at `src/` and add a co-located `server/` directory for the Node API and SQLite persistence. This avoids a large repo restructure while still separating backend concerns cleanly.

## Complexity Tracking

No constitution exceptions are required for this feature.
