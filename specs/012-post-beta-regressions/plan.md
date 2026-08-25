# Implementation Plan: Post-Beta Consistency and Drag Reliability

**Branch**: `fix/post-beta-regressions` | **Date**: 2026-08-25 | **Spec**: [spec.md](spec.md)

## Summary

Repair four production-acceptance findings and one promotion-discovered production stability defect by enforcing a workspace/board invariant during hydration, centralizing calendar-date handling, replacing event-only drag previews with explicit last-valid insertion state, adding workspace selection directly to automation management, and bounding Admin audit reads in SQLite. Preserve public API shapes, SQLite data, RBAC, audit history, accepted click/touch semantics, and production until the new canary candidate is approved.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Node/Express 5
**Primary Dependencies**: React context/reducer, dnd-kit React/sortable, Zod v4, shadcn/Tailwind
**Storage**: Existing SQLite data; add only a non-destructive descending index on `audit_events.created_at`
**Testing**: Vitest, Testing Library, server integration tests, Playwright Chromium
**Target Platform**: Modern desktop/mobile browsers and Linux OCI deployment
**Project Type**: React client plus Express API
**Performance Goals**: Drag preview responds per input frame without server round trips; hydration remains linear in accessible state
**Constraints**: Preserve existing API contract and legacy dates; no new DnD dependency; canary-first exact candidate
**Scale/Scope**: Five Issues, five user stories, primarily client changes plus one bounded server query

## Constitution Check

| Principle | Status | Evidence |
|---|---|---|
| Spec-first and Issue traceability | PASS | US1–US4 map to #24, #23, #25, #26 |
| Red → Green → Refactor | PASS | Every story starts with focused regression tasks |
| Security and data integrity | PASS | Selection invariant and RBAC preservation are explicit; no migration planned |
| Accessible responsive UX | PASS | Touch, reduced motion, empty states, labels, three viewports included |
| Clean reproducible source | PASS | Isolated worktree from `c97576a` |
| Canary-first GitOps | PASS | New production work is out of scope; deployment ends at canary |
| Evidence as product | PASS | Artifacts, report, PR/Issue and deployment evidence are tasks |

## Technical Approach

1. Add pure navigation-selection reconciliation that resolves workspace first, then accepts only a matching board; use it for session hydration and deletion fallbacks.
2. Add a date-only utility that accepts canonical `YYYY-MM-DD` and legacy ISO inputs, returns safe calendar parts, and never routes date display through local conversion of midnight UTC. Store new edits canonically as `YYYY-MM-DD` while reading legacy values compatibly.
3. Add pure insertion projection for card groups and lane IDs. Track explicit `{groupId,index}` last-valid insertion separately from dnd-kit's transient collision target, render a real inert placeholder/gap, and persist from that same preview.
4. Lift automation workspace selection into the Automations content contract, derive authorized workspace options, and reconcile board selection on every scope change/refresh.
5. Move the Admin audit limit into SQL, cap repository callers, and index newest-first ordering without deleting or rewriting history.

## Project Structure

```text
src/
├── components/BoardView.tsx
├── components/NavigationOverlay.tsx
├── components/CardModal.tsx
├── lib/date-only.ts
├── lib/drag-preview.ts
└── store.tsx

src/**/*.test.ts(x)
tests/e2e/
specs/012-post-beta-regressions/
tests/reports/
```

**Structure Decision**: Extend existing client components and pure helper modules; do not introduce new application layers or server endpoints.

## Validation Strategy

- Focused pure reducer/date/drag tests first, each observed red before implementation.
- Component tests for modal due dates, hydration, explicit insertion placeholders, automation selectors and permissions.
- Serial E2E for timezone display, timed session refresh, repeated DnD boundaries, and automation scope.
- `npm audit`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e`, and exact-candidate `npm run test:ci`.
- Interactive canary browser QA at 375px, 768px, and 1280px plus live health/log/event checks.

## Rollout and Rollback

- One immutable OCI image from the clean committed source; deploy only `apps/strata-canary` through Gitea/ArgoCD.
- Roll back canary by reverting its single values change to `canary-da29d57-20260825` and verify sync/health.
- Production stays pinned to approved digest `sha256:b4715a878bd9a3674390c1c44f74f9880abf4130d5cde4b7d8f03cb1e979c528` until a later explicit approval.

## Complexity Tracking

No constitution violations or complexity exceptions.
