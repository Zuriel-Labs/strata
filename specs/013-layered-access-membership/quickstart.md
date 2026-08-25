# Quickstart: Layered Administration and Board-Rooted Membership

## Context evidence

- Isolated worktree: /Users/chris/Documents/Github/strata-post-beta-regressions
- Branch: fix/post-beta-regressions
- Starting head: 4478e00 (fix: bound admin audit retrieval)
- Claimed work item: [GitHub Issue #29](https://github.com/Broville/strata/issues/29), labeled priority:critical and agent:working
- Production remained unchanged throughout implementation.

## Development

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e
```

## Core verification scenarios

### Mixed System Admin assignments

1. Bootstrap a System Administrator.
2. Create three workspaces and at least two boards per workspace.
3. Create an account with System Admin enabled, Workspace Admin grants on two workspaces, Board Admin grants on boards outside those workspaces, and no Board memberships.
4. Confirm the account administers every resource globally but appears in no Board membership list.
5. Demote it only after another active System Administrator exists; confirm retained explicit scoped grants define its remaining authority.

### Scoped membership delegation

1. Create one Workspace Administrator grant and one unrelated Board Administrator grant for a regular account.
2. Sign in as that account without Board membership.
3. Add an existing user to an in-scope board as Member.
4. Confirm derived workspace membership appears.
5. Attempt to mutate an out-of-scope board and administrative grants; expect `403` and no change.

### Migration

1. Build a legacy database containing Workspace `workspace_admin`, Workspace `member`, Board `board_admin`, Member, and Observer rows.
2. Start the new application twice.
3. Verify grant uniqueness, Board Administrator collaboration preservation, direct Workspace Member semantic removal, identical second-run counts, and `PRAGMA integrity_check = ok`.

### Scale

1. Seed at least 250 users, 100 workspaces, and 1,000 boards.
2. Open Admin People and confirm one bounded page.
3. Search users and board resources; page deterministically.
4. Select assignments across pages, clear the filter, and save.
5. Reload and confirm every selection.

## Canary

Canary remains `https://strata-canary.eaglepass.io`. Deploy only an immutable image built from a clean committed tree, then live-test System, Workspace, Board, and regular users. Reset only canary's ephemeral Strata pod data after QA so the user receives first-account setup.
