# Data Model: Default Workspace/Board Preferences

## User Preferences Fields

### users table extension
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `default_workspace_id` | TEXT | NULLABLE, FK → workspaces.id | User's preferred default workspace |
| `default_board_id` | TEXT | NULLABLE, FK → boards.id | User's preferred default board |

## Validation Rules

1. `default_workspace_id` must be NULL or reference a workspace the user has access to
2. `default_board_id` must be NULL or reference a board in the specified workspace the user has access to
3. If `default_workspace_id` is NULL, `default_board_id` must also be NULL
4. `default_board_id` can only be set if `default_workspace_id` is set

## Session Payload Integration

The `SessionUser` type will be extended:
```typescript
interface SessionUser {
  // ... existing fields
  defaultWorkspaceId: string | null;
  defaultBoardId: string | null;
}
```

## State Transition

### Default Selection Logic (buildSessionPayload)

```
IF user.default_workspace_id IS NOT NULL:
  currentWorkspaceId = user.default_workspace_id
  IF user.default_board_id IS NOT NULL:
    currentBoardId = user.default_board_id
  ELSE:
    // Fall back to alphabetically first board in default workspace
    currentBoardId = boards.find(b => b.workspaceId === currentWorkspaceId)?.id ?? null
ELSE:
  // Use existing alphabetically-first behavior
  currentWorkspaceId = workspaces[0]?.id ?? null
  currentBoardId = boards.find(b => b.workspaceId === currentWorkspaceId)?.id ?? boards[0]?.id ?? null
```

## Migration Path

1. Add `default_workspace_id` column as nullable TEXT
2. Add `default_board_id` column as nullable TEXT  
3. No data backfill needed (NULL means no preference set)
