# Implementation Plan: Board Member Card Collaboration

**Branch**: `feat/board-member-permissions` | **Date**: 2026-08-25 | **Spec**: [spec.md](spec.md) | **Issue**: [#30](https://github.com/Broville/strata/issues/30)

## Summary

Extend the existing layered RBAC capability model so exact Board Members can collaborate on cards without acquiring list or Board administration. Add dedicated, ownership-aware comment mutations; add full existing-automation edit mode; align role-aware UI controls; and prove both permitted and denied paths through unit, integration, component, contract, and end-to-end tests.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Node.js/Express 5
**Primary Dependencies**: Existing React context/store, Express routers, Zod v4, better-sqlite3; no new runtime dependency
**Storage**: Existing SQLite cards JSON fields and audit table; no schema migration
**Testing**: Vitest, Testing Library, Supertest, Playwright
**Target Platform**: Strata web client and Linux container server
**Project Type**: React client + Express API web application
**Performance Goals**: No additional session polling or Board-wide request; comment mutation remains a single atomic card update
**Constraints**: Preserve layered grants, Board-derived membership, current database compatibility, five-second session refresh, canary-first delivery, and immutable image identity
**Scale/Scope**: Existing Board/card/comment JSON model; mutation work is proportional to one card's bounded comment collection

## Constitution Check

| Principle / gate | Planned compliance |
|---|---|
| Spec-first and issue traceability | Issue #30, spec, completed requirement checklists, contracts, plan, and tasks precede implementation |
| Red → Green → Refactor | Each RBAC, comment, client permission, automation edit, and browser slice begins with a focused failing test |
| Security, authorization, audit, data integrity | Server capabilities are authoritative; comment author is session-derived; generic bypass removed; privileged deletion audited |
| Accessible, responsive, failure-honest UX | Role-aware controls, labeled edit/delete actions, pending states, errors, authoritative recovery, and responsive validation |
| Clean, reproducible source | Isolated worktree from `origin/main` at `3c0c503`; clean committed source required before image build |
| Canary-first GitOps | Exact image deploys only to `strata-canary`; production remains unchanged pending approval |
| Documentation and evidence | Contract, task state, test report, PR evidence, image digest, GitOps revision, and tailored checklist will be recorded |

No constitution exception is required.

## Design

### Server authorization

- Add exact Member-role detection and make `canEditBoardCards` true for either managing administrators or Members on the target Board.
- Keep Board/list lifecycle, list sorting/title/movement, card archive/delete, shared labels, and automations behind administrative capabilities.
- Use `canEditBoardCards` for card create, move, duplicate, and collaborative field updates.
- Validate card assignees as active `member` memberships on the same Board.

### Comment API

- Remove `comments` and `activity` from the generic card update schema.
- Add strict add/edit/delete comment routes under a Card.
- Generate comment identity, actor identity, and timestamp on the server.
- Preserve immutable fields on edit; allow edit only when `comment.userId` equals the actor.
- Allow delete only through `canManageBoard`; write Board-scoped audit events.
- Return the authoritative Card after every successful mutation.

### Client permission and UI

- Add `canEditBoardCardsForSession` based on exact current-user membership role.
- Use administrative permission—not card edit permission—for list title, sort menu, and list dragging.
- Gate Card modal list move, title, watch, optional section actions, attachments, labels, checklists, and comments by card collaboration capability.
- Offer Edit only on the current user's comments and Delete only to managing administrators; persist through dedicated services and apply server-returned Card state.
- Filter card assignee selectors to Member-role Board IDs exposed by the server.

### Automation edit flow

- Add a reversible form mapper from an existing rule, including local datetime conversion.
- Add an Edit action to each rule in the active Management Automations view.
- Reuse the create form as edit mode, submit a full update, apply the server response, and keep the stored rule unchanged on failure.

## Project Structure

```text
server/src/
├── rbac/permissions.ts
├── routes/card-routes.ts
└── db/repositories.ts

server/tests/
├── permissions.test.ts
├── rbac-routes.test.ts
└── board-member-collaboration.test.ts

src/
├── lib/auth-context.tsx
├── services/data.ts
├── components/BoardView.tsx
├── components/CardModal.tsx
├── components/NavigationOverlay.tsx
└── components/automation-rule-form.ts

tests/
├── contract/
└── e2e/

specs/030-board-member-permissions/
└── feature artifacts and test report references
```

**Structure Decision**: Extend the existing server/client boundaries and test suites; no new framework, persistence layer, or top-level source package is needed.

## Rollout and Rollback

- Build one immutable image from the clean PR candidate and deploy only the Canary chart through Gitea/ArgoCD.
- Validate Member and administrator journeys with a purpose-created non-admin Member account in Canary.
- Rollback is the previous known-good Canary image digest and Homelab commit; no schema rollback is required because storage schema is unchanged.
- Production remains on its current approved digest until explicit candidate-specific approval.
