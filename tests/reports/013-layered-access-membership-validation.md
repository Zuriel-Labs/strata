# Validation: Layered Administration and Board-Rooted Membership

Date: 2026-08-25
Issue: [#29](https://github.com/Broville/strata/issues/29)
Branch: `fix/post-beta-regressions`

## Acceptance evidence

- Dedicated Workspace and Board administrator grant tables, indexed unique relationships, cascades, and an idempotent legacy migration.
- Board membership is the only collaboration assignment; derived Workspace membership comes from Board memberships.
- Creating a Workspace no longer writes a legacy administrative membership row.
- Existing card assignees are migrated to Board memberships so upgrades preserve collaboration.
- System Administrators can atomically manage mixed scoped grants and Board membership; scoped administrators cannot escalate account or access authority.
- Workspace and Board Administrators can manage existing active accounts only in effective Board scope, without becoming members themselves.
- Card and automation member choices use actual Board membership, never administrative access.
- Account, resource, member, and eligible-user queries are searched, deterministic, paginated, and bounded to at most 100 rows per page.
- Off-page selections remain named and selected through the bounded `selectedItems` projection.
- Optimistic concurrency, last-System-Administrator safeguards, session invalidation/reissue, atomic writes, and success/failure audit evidence are covered.
- Scale fixture covers 250 accounts, 100 Workspaces, and 1,000 Boards.

## Automated gates

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| Vitest unit/integration/contract suites | PASS — 38 files / 271 tests |
| `npm run build` | PASS |
| Playwright E2E, including System and scoped layered access | PASS — 19 tests |
| `npm run test:ci` | PASS |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |
| Migration rerun + `PRAGMA integrity_check` | PASS |

## Responsive visual QA

The in-app browser was used against the local production-equivalent UI:

| Viewport | Workflow | Result |
|---|---|---|
| 375×812 | Scoped People and Board Members | PASS; no horizontal overflow |
| 768×900 | Scoped People directory | PASS; stacked layout and bounded dialog |
| 1280×900 | System Create User and scoped People | PASS; independent access/membership columns and internal vertical scroll |

Dark-mode screenshots and DOM inspection confirmed labeled controls, qualified Board names, role-specific tab visibility, System Administrator explanatory state, and keyboard-reachable native controls. Automated component coverage verifies off-page selection persistence.

The E2E suite runs serially because its journeys intentionally share one persistent SQLite database; this prevents one security-sensitive session invalidation or membership mutation from interfering with another authenticated journey.

## Canary gate

Pending the exact committed source SHA, immutable image digest, GitHub CI, canary GitOps rollout, live role-matrix QA, and final first-account reset. Production remains unchanged.
