# Implementation Plan: Kanban Productivity Suite

**Branch**: `feat/kanban-productivity-suite` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)
**Input**: GitHub Issues #15, #16, #17, #18, and #19 consolidated into `/specs/011-kanban-productivity-suite/spec.md`

## Summary

Deliver five related board-workflow improvements as one canary candidate: modern accessible card reordering, persistent list sorting, card duplication, in-card label administration, and safe rich-text descriptions. The client will use the React 19-compatible dnd-kit React API for pointer and keyboard sorting and Tiptap for editing a deliberately constrained ProseMirror document. The server remains authoritative for permissions and all persistent mutations, uses SQLite transactions for every multi-row operation, records audit events, and keeps the current plain-text description as a backward-compatible projection of a new additive rich-text document column.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19.2, Node.js 24-compatible ESM
**Primary Dependencies**: Express 5.2, better-sqlite3 12.10, Zod 4.3, `@dnd-kit/react` 0.5, `@dnd-kit/helpers`, Tiptap 3.30 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`), Tailwind CSS, shadcn/Radix UI
**Storage**: SQLite; additive `cards.description_json` migration with no table rebuild or destructive rewrite
**Testing**: Vitest, React Testing Library, Supertest, Playwright Chromium, TypeScript compiler, ESLint
**Target Platform**: Responsive browser client and Linux OCI container in the `strata-canary` Kubernetes namespace
**Project Type**: Full-stack web application in one repository
**Performance Goals**: 60 fps-class local drag feedback, no network request during drag hover, one bounded mutation per completed user action, and no per-card request loops
**Constraints**: Authenticated same-board RBAC, audit coverage, validated rich-text shape/size/link protocols, keyboard-accessible operations, deterministic ordering, migration-safe rollback, immutable canary image, and no production change before explicit approval
**Scale/Scope**: Five open Issues, five independent user stories, existing board/list/card relational model, and all supported desktop/mobile-responsive board layouts

## Constitution Check

*GATE: Passed before research and re-checked after design.*

| Principle | Evidence | Result |
|---|---|---|
| Spec and Issue traceability | Five user stories map one-to-one to Issues #15–#19; every functional requirement has an acceptance path. | PASS |
| Strict Red → Green → Refactor | Tasks require failing focused tests before production changes, then targeted and full-suite validation. | PASS |
| Security, RBAC, audit, and data integrity | Existing policy functions remain the authorization boundary; validation and audit events cover every new mutation; multi-row writes are transactional. | PASS |
| Accessible, responsive, failure-honest UX | Pointer and keyboard drag, menu commands, focus handling, visible pending/error states, optimistic rollback, and mobile-safe controls are specified. | PASS |
| Clean and reproducible source | Work occurs in an isolated clean worktree from exact `origin/main`; only declared dependencies are added. | PASS |
| Canary GitOps and production approval | Candidate identity is source SHA + image digest + homelab commit; production is explicitly excluded. | PASS |
| Documentation and evidence | Spec, research, data model, OpenAPI contract, quickstart, task ledger, validation report, PR, and per-Issue evidence are required. | PASS |

Post-design re-check: the new schema field is additive, old binaries continue to read `description`, all new endpoints reuse established authentication and permission boundaries, and no exception to the constitution is required.

## Project Structure

### Documentation (this feature)

```text
specs/011-kanban-productivity-suite/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── kanban-productivity.openapi.yaml
├── checklists/
│   ├── api.md
│   ├── migration.md
│   ├── requirements.md
│   ├── security.md
│   └── ux.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── BoardView.tsx
│   ├── BoardView.test.tsx
│   ├── CardModal.tsx
│   ├── CardModal.test.tsx
│   ├── LabelEditor.tsx
│   ├── RichTextEditor.tsx
│   └── RichTextRenderer.tsx
├── lib/
│   ├── card-order.ts
│   └── rich-text.ts
├── services/data.ts
├── store.tsx
└── types.ts

server/src/
├── db/
│   ├── repositories.ts
│   └── schema.ts
├── rbac/permissions.ts
└── routes/
    ├── board-routes.ts
    ├── card-routes.ts
    └── list-routes.ts

server/tests/
├── crud-routes.test.ts
├── foundation.test.ts
└── rbac-routes.test.ts

tests/
├── contract/
│   └── kanban-productivity.contract.test.ts
├── e2e/
│   └── kanban-productivity.spec.ts
└── reports/
    └── 011-kanban-productivity-suite-<timestamp>.md
```

**Structure Decision**: Extend the existing client/server organization instead of introducing a feature framework. Shared rich-text types and deterministic ordering helpers live in `src/lib`; server persistence and route orchestration stay in the established database and route modules. Reusable editor/renderer/label UI components keep `BoardView` and `CardModal` focused.

## Architecture and Delivery Decisions

1. `descriptionDocument` is the canonical rich representation. `description` remains a server-generated plain-text projection for search, compatibility, and rollback.
2. The server validates the document recursively with an allowlist, depth/node/text limits, and safe link protocols before serializing it. The UI never renders stored arbitrary HTML.
3. A completed drag sends exactly one existing `POST /api/cards/{cardId}/move` mutation. The server verifies the destination list belongs to the card's board and rewrites compact active positions in one transaction.
4. A list sort sends `POST /api/lists/{listId}/sort` with `asc` or `desc`. The server applies a fixed `en-US` natural, case-insensitive collation with stable current-position/id tie breakers and persists the result atomically.
5. Duplication uses `POST /api/cards/{cardId}/duplicate`; the transaction copies user-authored card content and creates fresh card/checklist/item/attachment identifiers while excluding comments, activity, archival/completion history, watching state, and automation history.
6. In-card label management reuses the existing board-label contract and state cleanup semantics. Label definitions are staged behind explicit Save/Cancel, then the card assignment picker updates against the confirmed definitions.
7. The source branch remains unmerged during canary evaluation. The GitOps change is limited to `apps/strata-canary/values.yaml`; production files and namespace are out of scope.

## Complexity Tracking

No constitution violations require justification.
