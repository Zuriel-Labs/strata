# Implementation Plan: Strata Board Workflow Hardening

**Branch**: `001-harden-board-workflows` | **Date**: 2026-03-14 | **Spec**: `specs/001-harden-board-workflows/spec.md`
**Input**: Feature specification from `specs/001-harden-board-workflows/spec.md`

## Summary

Harden board administration flows by closing UI and API permission leaks, finish the Strata rename, add board-scoped label management with a searchable card label picker, simplify card interactions, and expand automations with saved list or label conditions plus scheduled execution. The implementation keeps the current React plus Express plus SQLite architecture, extends the existing board and automation persistence model, and introduces a lightweight server-side automation runner for schedule-based rules.

## Technical Context

**Language/Version**: TypeScript 5.9 on both client and server  
**Primary Dependencies**: React 19, Express 5, better-sqlite3, Zod 4, Vite, Vitest, Playwright, Radix UI, Tailwind CSS  
**Storage**: SQLite via better-sqlite3 with JSON-backed board labels and automation configuration  
**Testing**: Vitest, Testing Library, Supertest, Playwright  
**Target Platform**: Web application running in modern desktop and mobile browsers with a local Express API on Linux development hosts  
**Project Type**: Web application  
**Performance Goals**: Board and card mutations remain interactive within a normal UI round trip; scheduled automation polling runs at minute-level cadence without blocking requests; board label and automation changes persist correctly after refresh  
**Constraints**: Preserve existing RBAC semantics, keep server-side authorization as the source of truth, avoid introducing external queue or cron infrastructure, keep board labels scoped per board, and preserve current app behavior outside the requested flows  
**Scale/Scope**: Small-to-medium collaborative boards with dozens of active boards, hundreds of cards per board, and a modest number of enabled automation rules per board

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Spec-First Development**: PASS - `specs/001-harden-board-workflows/spec.md` exists before implementation.
- **Test-Driven Quality**: PASS - plan includes route, component, and end-to-end validation for every user story plus regression coverage for existing board flows.
- **Constitution Alignment**: PASS - the approach keeps changes inside documented artifacts and reserves remediation for any uncovered gaps.
- **Iterative Refinement**: PASS - work is split into spec, plan, tasks, implementation, and validation phases.
- **Documentation as Code**: PASS - this feature adds and maintains `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `contracts/`, and `tasks.md`.

## Project Structure

### Documentation (this feature)

```text
specs/001-harden-board-workflows/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── components/
├── lib/
├── services/
├── store.tsx
└── types.ts

server/
├── src/
│   ├── app.ts
│   ├── db/
│   ├── rbac/
│   ├── routes/
│   └── types.ts
└── tests/

tests/
├── contract/
└── e2e/
```

**Structure Decision**: Keep the existing single-repo web application split: React client code remains under `src/`, Express plus SQLite code remains under `server/src/`, server integration coverage remains under `server/tests/`, and browser validation remains under `tests/e2e/`.

## Phase 0: Research Decisions

1. Keep board labels stored on the board record and add dedicated board-label mutation endpoints plus server-side validation that card labels and automation label conditions belong to the active board.
2. Introduce explicit automation conditions and schedule metadata in persisted automation rules instead of overloading the existing ad hoc list-only trigger configuration.
3. Add a lightweight in-process server automation runner that polls enabled scheduled rules on an interval and applies actions to matching non-archived cards.
4. Tighten RBAC through named board policy helpers shared by routes and mirrored by frontend visibility helpers so restricted controls disappear for non-admin roles while APIs remain authoritative.
5. Rework card label and member affordances inside existing board and card modal surfaces rather than creating a new standalone card editor.

## Phase 1: Design & Contracts

- Extend the automation rule persistence model to store conditions and schedule execution state needed for one-time and recurring triggers.
- Add board-label repository helpers and route contracts for create, edit, and delete flows scoped to a single board.
- Update shared client and server types so automation triggers, conditions, and actions stay aligned across API, store, and UI layers.
- Define how scheduled rules select candidate cards using saved list and label conditions and skip archived cards.
- Document UI contracts for always-visible card label actions, streamlined card creation, initials-only member chips, and board-admin-only label management.

## Complexity Tracking

No constitution violations are expected for this design.
