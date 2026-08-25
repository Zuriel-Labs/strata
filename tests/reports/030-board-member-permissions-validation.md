# Validation: Board Member Card Collaboration

Date: 2026-08-25
Issue: [#30](https://github.com/Broville/strata/issues/30)
PR: [#31](https://github.com/Broville/strata/pull/31)
Branch: `feat/board-member-permissions`
Status: Local implementation validated; exact-commit Canary evidence pending

## Acceptance evidence

- Exact `member` Board memberships now grant card collaboration without granting list, Board, Workspace, or platform administration; Observers remain read-only.
- Members can create, edit, drag, duplicate, assign eligible Members, manage dates/attachments/existing labels/rich descriptions/checklists, add and edit their own comments, and toggle watched state.
- Card assignees are limited to unique, active, Member-role accounts on the same Board. Administrative access remains independent from membership.
- List title, movement, sorting, archive/restore/delete, card archive/delete, shared-label definitions, and automation management remain administrative.
- Comment identity, author, and creation time are server-controlled. Generic Card updates cannot replace comments or activity; authors can edit only their own comments; managing administrators alone can delete comments.
- Comment create/edit/delete and automation edits retain Board-scoped audit evidence.
- Board Admin, inherited Workspace Admin, and System Admin can edit complete existing automation configurations in scope. Board scope is immutable and failed edits preserve the stored rule and draft.
- Card movement is accepted only through the validated move endpoint; generic `listId`/`position` updates and cross-Board list injection are rejected.
- Checklist title editing, whole-checklist deletion, and explicit due-date removal complete the requested Member card controls.

## Red-green record

Focused tests failed before each implementation slice for the expected missing behavior:

- server/client capability tests denied exact Members;
- route tests denied Member create/move/duplicate and exposed list-sort overreach plus Observer assignee acceptance;
- component tests lacked Member mutation controls and retained administrative list controls;
- comment tests exposed client-supplied history/author replacement and lacked ownership-aware routes;
- automation tests lacked existing-rule form mapping and an Edit action;
- Card modal tests lacked due-date removal and whole-checklist rename/delete;
- security regressions exposed generic Card movement and cross-Board list injection;
- the new browser journey initially exposed two selector/drag-test assumptions, which were corrected without weakening product assertions.

After remediation, the focused collaboration, comment, contract, component, and browser suites passed. The first repository-wide run also identified five stale pre-feature denial expectations, which were updated to the new role matrix. The first full CI attempt hit one pre-existing 10-second contract-test timeout under parallel bcrypt load; that test now has a bounded 20-second timeout and the complete gate passed on the final tree.

## Automated gates

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test` | PASS — 41 files / 300 tests |
| `npm run build` | PASS |
| `npm run test:e2e` | PASS — 20 Chromium journeys |
| `npm run test:ci` | PASS — lint, 300 tests, production build, 20 browser journeys |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |
| SQLite `PRAGMA integrity_check` | PASS — `ok` |
| `git diff --check` | PASS |

The Vite build retains its existing informational warning that the main JavaScript chunk exceeds 500 kB. No dependency or database-schema migration was added.

## Review findings and remediation

| Area | Finding | Outcome |
|---|---|---|
| Authorization | The generic Card update endpoint could move a Card without transactional order validation | Removed `listId` and `position`; movement uses the dedicated endpoint |
| Scope integrity | Card creation accepted a list ID from another Board | Added active same-Board list validation before insert |
| Comment trust | Generic Card updates accepted caller-authored comment and activity arrays | Removed both fields and added strict ownership-aware endpoints |
| Membership | Observer memberships were eligible for Card assignment | Restricted server validation and client projections to active Member roles |
| Automation scope | Unknown update fields, including `boardId`, were silently stripped | Made the automation update schema strict |
| Failure handling | Automation edits could not preserve a draft because edit mode did not exist | Added prefill, pending/error state, authoritative update, and Cancel behavior |
| Accessibility | New edit/delete operations needed deterministic labels and touch-size controls | Added explicit accessible names and minimum 40–44 px controls |

No unresolved correctness, security, data-integrity, accessibility, performance, maintainability, or test-coverage finding remains within the Issue #30 scope.

## Canary gate

The linked PR is open. The next gate is to build one immutable image from the clean committed tree and deploy only that exact candidate to `strata-canary`. Production must remain unchanged until the user approves this exact Canary candidate.
