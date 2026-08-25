# Data Model: Layered Administration and Board-Rooted Membership

## Relationship map

```text
User 1 ── 0..* WorkspaceAdminGrant * ── 1 Workspace
User 1 ── 0..* BoardAdminGrant     * ── 1 Board ── 1 Workspace
User 1 ── 0..* BoardMembership     * ── 1 Board

DerivedWorkspaceMembership(user, workspace)
  := exists BoardMembership(user, board) where board.workspace = workspace

EffectiveBoardAdmin(user, board)
  := SystemAdmin(user)
  OR WorkspaceAdminGrant(user, board.workspace)
  OR BoardAdminGrant(user, board)
```

## User

Existing fields remain. `platform_role` remains `system_admin | user`.

Validation:

- username unique;
- active final System Administrator safeguard;
- `updated_at` is the concurrency token for full account updates.

## Workspace Administrator Grant

| Field | Rule |
|---|---|
| `id` | stable UUID primary key |
| `user_id` | required user FK, cascade delete |
| `workspace_id` | required workspace FK, cascade delete |
| `granted_by_user_id` | nullable user FK; null only for migration/bootstrap |
| `created_at` | required UTC timestamp |

Constraints/indexes:

- unique `(user_id, workspace_id)`;
- indexes on `user_id` and `workspace_id`.

## Board Administrator Grant

| Field | Rule |
|---|---|
| `id` | stable UUID primary key |
| `user_id` | required user FK, cascade delete |
| `board_id` | required board FK, cascade delete |
| `granted_by_user_id` | nullable user FK; null only for migration/bootstrap |
| `created_at` | required UTC timestamp |

Constraints/indexes:

- unique `(user_id, board_id)`;
- indexes on `user_id` and `board_id`.

## Board Membership

Existing table remains canonical with normalized role values:

- `member`: view and edit collaboration;
- `observer`: view/comment collaboration according to existing Strata behavior.

`board_admin` is migration input only and MUST NOT be accepted by new writes.

Constraints/indexes:

- unique `(user_id, board_id)`;
- indexes on `user_id` and `board_id`;
- active user required for new membership;
- no relationship to administrative grant presence.

## Legacy Workspace Membership

The existing table is retained physically for compatibility evidence but is no longer an authority or collaboration source after migration. No new application writes are permitted. Workspace collaborators are computed from Board memberships joined to Boards.

## Permission Snapshot

Authenticated sessions expose:

```ts
{
  isSystemAdmin: boolean;
  workspaceAdminGrants: WorkspaceAdminGrant[];
  boardAdminGrants: BoardAdminGrant[];
  boardMemberships: BoardMembership[];
  derivedWorkspaceIds: string[];
}
```

The server remains authoritative; the client snapshot controls presentation only.

## Administrative Directory Projection

Each account row contains identity plus bounded summaries:

- explicit workspace-admin count;
- explicit board-admin count;
- board-membership count;
- derived workspace count;
- effective actor permissions for allowed actions.

Full assignments load only for the selected account.

## State transitions

### Grant administrative access

1. Authenticate System Administrator.
2. Validate target user/resources and deduplicate IDs.
3. Verify optimistic concurrency token.
4. Replace requested grant/membership sets in one transaction.
5. Update `users.updated_at`.
6. Invalidate target sessions.
7. Append audit events with IDs/counts, never secrets.

### Scoped membership change

1. Authenticate any effective administrator.
2. Resolve board and verify effective Board Administrator authority.
3. Validate active target user and membership level.
4. Insert/update/delete one Board membership transactionally.
5. Invalidate target sessions.
6. Append board-scoped audit event.

### Legacy migration

1. Create grant tables and indexes if missing.
2. Insert Workspace Administrator grants from legacy rows if absent.
3. Insert Board Administrator grants from legacy rows if absent.
4. Normalize corresponding legacy `board_admin` membership roles to `member` in the same transaction.
5. Materialize Board membership for existing card assignees so collaboration is preserved under the Board-root invariant.
6. Preserve legacy workspace rows and all unrelated data.
7. Repeat safely without duplicate or further mutation.

## Deletion behavior

- User deletion cascades that user's grants and Board memberships.
- Board deletion cascades Board grants and memberships for that board.
- Workspace deletion cascades Workspace grants and, through Boards, Board grants and memberships.
- Audit history remains immutable and may retain deleted IDs.
