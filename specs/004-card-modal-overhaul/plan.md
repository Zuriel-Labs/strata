# Implementation Plan: Card Modal Overhaul

**Branch**: `004-card-modal-overhaul` | **Date**: 2026-03-14 | **Spec**: `specs/004-card-modal-overhaul/spec.md`

## Summary

Refresh `CardModal` to match the supplied reference images by simplifying the header, moving list selection into the top bar, introducing click-to-edit title behavior, hiding optional metadata until it is present or explicitly revealed, removing checklist affordances, and tightening watch/member synchronization for the active user.

## Technical Context

**Language/Version**: TypeScript 5.9 on React 19 and Node.js 20+
**Primary Dependencies**: React, Vite, Express, better-sqlite3, Vitest, Playwright, lucide-react
**Storage**: SQLite via existing card CRUD API
**Testing**: Vitest for reducer/component coverage, Playwright for end-to-end regression
**Target Platform**: Browser-based web application on desktop and mobile viewports
**Project Type**: web
**Performance Goals**: Card modal interactions feel immediate; list move and inline title save complete within the existing optimistic UI flow
**Constraints**: Preserve current card endpoints, keep close behavior unchanged, do not introduce checklist UI, and follow the supplied reference layout closely
**Scale/Scope**: Single modal refresh affecting existing board users across all card detail flows

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| Spec-First Development | PASS | Spec 004 exists before implementation begins |
| Test-Driven Quality | PASS | Reducer, component, and E2E coverage planned for changed behavior |
| Constitution Alignment | PASS | Planned changes map directly to scoped modal requirements |
| Iterative Refinement | PASS | Work is organized into behavior, layout, and regression phases |
| Documentation as Code | PASS | Spec, plan, tasks, quickstart, and data notes are created together |

## Phase 0: Research

### Decision 1: Watch semantics stay tied to the active session user
**Decision**: Treat the existing `card.watching` boolean as the watch state for `currentUserId`, and only auto-toggle it when the active user is added to or removed from `memberIds`.
**Rationale**: The current app state models one active signed-in user and exposes watch as a single card boolean. Preserving that shape avoids unnecessary schema and API churn for a UI-focused refresh.
**Alternatives Considered**: Introduce per-user watcher arrays (rejected - larger data model and API change not required by this request).

### Decision 2: Optional section visibility uses modal-local reveal state
**Decision**: Seed visible optional sections from existing card data and keep additional revealed sections in local modal state for the duration of the open modal.
**Rationale**: This matches the references, avoids persisting purely presentational state, and lets empty sections appear only when the user intentionally adds them.
**Alternatives Considered**: Persist section visibility on the card record (rejected - no user value beyond the active modal session).

### Decision 3: Inline title editing commits on blur or Enter
**Decision**: Replace the always-editable header input with display text that swaps to an input on click, then saves trimmed changes on Enter or blur.
**Rationale**: This matches the requested interaction more closely and reduces accidental edits while still keeping editing lightweight.
**Alternatives Considered**: Keep the existing always-on input (rejected - does not match the requested UX).

## Phase 1: Design & Contracts

### Data Model
See `specs/004-card-modal-overhaul/data-model.md`.

### API Contracts
See `specs/004-card-modal-overhaul/contracts/card-modal.md`.

## Project Structure

No repository restructuring is required. The change stays within the existing frontend modal, store logic, and tests.

### Modified Files

```text
src/
├── components/
│   ├── CardModal.tsx
│   └── CardModal.test.tsx
├── store.tsx
└── store.test.ts

tests/
└── e2e/
    └── app.spec.ts
```

**Structure Decision**: Use the existing single-frontend structure under `src/` with targeted regression coverage in `tests/e2e/`.

## Complexity Tracking

No constitution exceptions required.
