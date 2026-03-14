# Data Model Changes: Core Platform Overhaul

## Schema Changes

### users table — rename `email` → `username`

| Field | Type | Notes |
|-------|------|-------|
| id | TEXT PRIMARY KEY | Unchanged |
| name | TEXT NOT NULL | Unchanged |
| initials | TEXT NOT NULL | Unchanged |
| color | TEXT NOT NULL | Unchanged |
| **username** | TEXT NOT NULL UNIQUE | **Renamed from `email`**. Alphanumeric + underscores + hyphens, 3-32 chars |
| platform_role | TEXT NOT NULL | Unchanged |
| password_hash | TEXT NOT NULL | Unchanged |
| active | INTEGER NOT NULL DEFAULT 1 | Unchanged |
| must_change_password | INTEGER NOT NULL DEFAULT 0 | Unchanged |
| created_at | TEXT NOT NULL | Unchanged |
| updated_at | TEXT NOT NULL | Unchanged |

### NEW: recovery_keys table

| Field | Type | Notes |
|-------|------|-------|
| id | TEXT PRIMARY KEY | UUID |
| user_id | TEXT NOT NULL | FK → users(id) ON DELETE CASCADE |
| key_hash | TEXT NOT NULL | Bcrypt hash of the recovery key |
| created_at | TEXT NOT NULL | Generation timestamp |
| consumed_at | TEXT | Null until used; set when key is consumed |

**Constraints**: UNIQUE(user_id) — only one active recovery key per user.

### workspace_memberships — remove `guest` from role enum

| Field | Change |
|-------|--------|
| role | Valid values: `workspace_admin`, `member` (removed `guest`) |

### board_memberships — remove `guest` from role enum

| Field | Change |
|-------|--------|
| role | Valid values: `board_admin`, `member`, `observer` (removed `guest`) |

## Type Changes

### Server Types (server/src/types.ts)

```typescript
// BEFORE
export type WorkspaceRole = 'workspace_admin' | 'member' | 'guest';
export type BoardRole = 'board_admin' | 'member' | 'observer' | 'guest';
// email: string in UserRecord, SessionUser

// AFTER
export type WorkspaceRole = 'workspace_admin' | 'member';
export type BoardRole = 'board_admin' | 'member' | 'observer';
// username: string in UserRecord, SessionUser
```

### New Types

```typescript
export interface RecoveryKeyRecord {
  id: string;
  userId: string;
  keyHash: string;
  createdAt: string;
  consumedAt: string | null;
}
```

## Relationships

- A `UserAccount` has zero or one active `RecoveryKey` (unused, non-consumed).
- When a new recovery key is generated, any existing unconsumed key for that user is replaced.
- Recovery key consumption is atomic with password update.

## State Transitions

### Recovery Key Lifecycle

1. User requests recovery key generation from settings
2. Server generates 32-byte hex random key
3. Server hashes key with bcrypt, stores hash in recovery_keys
4. Server returns plaintext key once to user (display-only)
5. Any existing unconsumed key for user is deleted first
6. User submits forgot-password: username + recovery key + new password + confirm
7. Server verifies key hash, updates password, marks key consumed
8. Consumed key cannot be reused

### Bootstrap Lifecycle

1. App checks `GET /api/auth/needs-bootstrap`
2. If `needsBootstrap: true`, show bootstrap wizard
3. User submits: username + password + confirm password
4. Server creates system_admin user, creates session, returns SessionPayload
5. Subsequent checks return `needsBootstrap: false`
