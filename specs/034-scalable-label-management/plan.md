# Implementation Plan: Scalable Label Management

**Branch**: fix/scalable-label-management | **Date**: 2026-08-26 | **Spec**: [spec.md](spec.md) | **Issue**: [#34](https://github.com/Broville/strata/issues/34)

## Summary

Eliminate persisted label identity collisions with collision-resistant definition IDs, add a durable System Administrator-controlled per-Board label policy defaulting to 12, enforce additive limits and stale-write protection in the API, and expose a shared accessible limit-aware editor in both current label-management surfaces. Preserve every existing Board label collection during migration and when a limit is lowered.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js 22; React 19 client and Express 5 server
**Primary Dependencies**: Existing React context/store, Express routers, Zod v4, better-sqlite3, browser Web Crypto; no new runtime dependency
**Storage**: SQLite singleton platform_settings row plus an additive labels_revision column on boards; existing labels_json remains authoritative
**Testing**: Vitest, Testing Library, Supertest, contract tests, Playwright
**Target Platform**: Responsive Strata web client and Linux OCI container server
**Project Type**: React client plus Express API web application
**Performance Goals**: Label editing remains bounded to at most 100 definitions; setting updates and label writes use one transaction; no new polling or per-row API requests
**Constraints**: Preserve RBAC, audit behavior, Board/card/automation references, existing databases, five-second session refresh, canary-first GitOps, and immutable image identity
**Scale/Scope**: 1–100 definitions per Board, all Boards under one platform policy, multiple concurrent administrators, desktop/tablet/phone management

## Constitution Check

The repository AGENTS.md operating standard is authoritative. The packaged constitution supplies only the compatible spec-first/documentation principles.

| Principle / gate | Planned compliance |
|---|---|
| Spec-first traceability | Issue #34, approved spec, completed quality checklists, plan, model, contract, quickstart, tasks, and report precede handoff |
| Strict Red → Green → Refactor | Identity, migration, policy, API, RBAC, UI, conflict, and browser slices begin with focused failing tests |
| Security and authorization | Server policy remains authoritative; setting mutation is System Admin-only; shared definition management retains Board scope |
| Data integrity and audit | Additive schema migration, atomic conditional writes, no automatic destructive legacy repair, and attributable audit evidence |
| Accessible responsive UX | Count/limit feedback, independent controls, 44px targets, keyboard/touch behavior, bounded scrolling, and explicit errors |
| Maintainable focused change | Reuse LabelEditor and existing services/store; add no runtime dependency or unrelated refactor |
| Reproducible delivery | Clean isolated worktree, full repository-native CI, independent review, immutable image, Canary-only GitOps |

No exception is required.

## Technical Design

### Persistence and migration

- Add a singleton platform_settings table with exactly one row, max_labels_per_board, and updated_at. Insert 12 idempotently.
- Constrain valid stored values to whole numbers 1–100 and safely repair a missing or invalid singleton to 12 at startup.
- Add boards.labels_revision as a non-negative integer defaulting to zero. Existing labels_json is not rewritten.
- Expose helpers to read/update the setting, count Boards above a proposed value, and list malformed duplicate-ID Boards for validation without destructive repair.

### Stable label identity

- Create new definition IDs with browser crypto.randomUUID rather than the shared page-local uid counter.
- Continue validating unique non-empty IDs, optional names, and supported color format at the server boundary.
- Keep definition ID independent from color, name, row position, and palette reuse.

### Label-policy and concurrency API

- Include maxLabelsPerBoard in authenticated app state and labelsRevision in every Board representation.
- Add a System Admin-only label-policy update under the existing admin router. Validate 1–100, persist atomically, count currently over-limit Boards, and audit safe old/new values.
- Extend the complete-collection label update contract with required expectedRevision.
- Inside one transaction, compare the expected revision, enforce additive limit rules, conditionally update labels_json while incrementing labels_revision, clean deleted references, and audit success.
- Return intentional machine-readable 409 conflicts for stale revisions and additive limit violations, including safe current policy/revision information.
- Existing over-limit collections may submit only non-additive updates. A new identity is allowed only when the current count is below the limit and the resulting count does not exceed it.
- Cap standard and custom definitions during Board creation using the current setting.

### Client state and services

- Extend Board and AppState types with labelsRevision and maxLabelsPerBoard.
- Update session hydration and reducer responses so authoritative policy/revision changes propagate without truncating cards or automations.
- Extend API errors with safe response code/details required for actionable conflict handling.
- Update label services and both callers to submit the Board revision and apply the authoritative returned collection/revision.
- After a stale conflict, preserve the draft, prevent a blind retry, and offer an explicit reload/review path.

### System Settings UI

- Add System Settings to the existing Admin Panel only when actor capabilities confirm System Administrator authority.
- Show current limit, allowed range, proposed value, and the number of loaded Boards above a proposed lower value.
- Use pending, success, validation, and server-error states. Refresh the authenticated session after a successful save so all open label managers receive the effective policy.
- Scoped administrators keep existing Administration tabs without the System Settings tab.

### Shared scalable editor

- Add maxLabels and authoritative revision-aware conflict behavior to the reusable LabelEditor rather than duplicating Board/card flows.
- Display count-of-limit copy and disable Add at or above the effective maximum while leaving all existing controls active.
- Keep the row list as the only scrolling region; keep count/error and Save/Cancel outside it.
- Ensure a color selector belongs to one stable ID and scrolls into view when opened.
- Reuse the 12-color palette, then cycle deterministically.

## Project Structure

    server/src/
    ├── db/schema.ts
    ├── db/repositories.ts
    ├── routes/admin-routes.ts
    ├── routes/board-routes.ts
    └── types.ts

    server/tests/
    ├── foundation.test.ts
    ├── crud-routes.test.ts
    ├── admin-routes.test.ts
    └── rbac-routes.test.ts

    src/
    ├── components/AdminPanel.tsx
    ├── components/BoardLabelsDialog.tsx
    ├── components/CardModal.tsx
    ├── components/Header.tsx
    ├── components/LabelEditor.tsx
    ├── services/admin.ts
    ├── services/api.ts
    ├── services/data.ts
    ├── store.tsx
    └── types.ts

    tests/
    ├── contract/
    └── e2e/

    specs/034-scalable-label-management/
    └── specification, design, contract, tasks, checklists, and validation evidence

**Structure Decision**: Extend existing client/server boundaries and test suites. No new source package, persistence framework, UI framework, or runtime dependency is justified.

## Rollout and Rollback

- Before image build, inspect the clean candidate database migration against fresh and legacy fixtures and inventory Canary label counts/duplicate IDs.
- Build one immutable image from reviewed clean source and deploy only the Canary chart through Gitea and ArgoCD.
- Reset only Canary test state when required by the established Canary workflow; production PVC and image remain unchanged.
- Validate policy changes, grandfathered Boards, six/twelve/above-twelve editor states, conflicts, roles, restart persistence, logs/events, and database integrity.
- Rollback uses the previous known-good Canary image digest and Homelab commit. The additive table/column may remain safely unused by older code; no destructive down-migration is required.
- Production remains unchanged until candidate-specific explicit approval.

## Complexity Tracking

No constitution or repository-standard violation requires justification.
