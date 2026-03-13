# Data Model: Server-Backed Auth and RBAC

## UserAccount

| Field | Type | Notes |
|-------|------|-------|
| id | string | Stable user identifier |
| name | string | Display name |
| initials | string | Avatar initials |
| color | string | Avatar color |
| email | string | Unique login identity |
| platformRole | enum | `system_admin` or `user` |
| passwordHash | string | Bcrypt hash |
| mustChangePassword | boolean | Forces password rotation before app access |
| active | boolean | Blocks sign-in when false |
| createdAt | string | Audit timestamp |
| updatedAt | string | Audit timestamp |

## Session

| Field | Type | Notes |
|-------|------|-------|
| id | string | Session identifier |
| userId | string | UserAccount foreign key |
| expiresAt | string | Session expiry |
| createdAt | string | Creation timestamp |
| lastSeenAt | string | Rolling activity timestamp |

## Workspace

Existing Strata workspace entity gains persistence and server ownership.

| Field | Type | Notes |
|-------|------|-------|
| id | string | Workspace identifier |
| name | string | Human-readable workspace name |
| description | string | Workspace summary |
| visibility | enum | Existing UI visibility value |
| createdAt | string | Creation timestamp |

## WorkspaceMembership

| Field | Type | Notes |
|-------|------|-------|
| id | string | Membership identifier |
| userId | string | UserAccount foreign key |
| workspaceId | string | Workspace foreign key |
| role | enum | `workspace_admin`, `member`, or `guest` |
| createdAt | string | Audit timestamp |

## Board

Existing Strata board entity remains, but access is derived from workspace and board membership.

| Field | Type | Notes |
|-------|------|-------|
| id | string | Board identifier |
| workspaceId | string | Workspace foreign key |
| title | string | Board title |
| visibility | enum | Existing UI visibility value |
| color | string | Accent color |
| starred | boolean | User-facing state for seed/demo continuity |

## BoardMembership

| Field | Type | Notes |
|-------|------|-------|
| id | string | Membership identifier |
| userId | string | UserAccount foreign key |
| boardId | string | Board foreign key |
| role | enum | `board_admin`, `member`, `observer`, or `guest` |
| createdAt | string | Audit timestamp |

## PasswordResetState

| Field | Type | Notes |
|-------|------|-------|
| userId | string | UserAccount foreign key |
| temporaryPasswordHash | string | Hash of generated temporary password |
| issuedByUserId | string | Actor who triggered reset |
| issuedAt | string | Reset timestamp |
| consumedAt | string nullable | Populated after successful password change |

## AuditEvent

| Field | Type | Notes |
|-------|------|-------|
| id | string | Event identifier |
| actorUserId | string nullable | Authenticated actor, if any |
| targetUserId | string nullable | Affected user |
| scopeType | enum | `platform`, `workspace`, `board`, `auth` |
| scopeId | string nullable | Associated workspace or board |
| action | string | Event action name |
| outcome | enum | `success` or `failure` |
| metadata | json | Context payload |
| createdAt | string | Event timestamp |

## Existing Collaborative Entities

`Workspace`, `Board`, `List`, `Card`, `Notification`, and `AutomationRule` persist in SQLite and are filtered server-side by authorized scope before being returned to the client.

## Relationships

- A `UserAccount` has many `Session` rows.
- A `UserAccount` has many `WorkspaceMembership` rows.
- A `Workspace` has many `Board` rows.
- A `UserAccount` may have many `BoardMembership` rows.
- A `UserAccount` may have zero or one active `PasswordResetState` row.
- `AuditEvent` can reference acting users, target users, and scoped resources.

## State Transitions

### Authentication lifecycle

1. `inactive` user -> denied sign-in
2. `active` user + correct password -> session created
3. `mustChangePassword = true` -> redirected to password-change flow
4. successful password change -> clear reset state and enter app
5. sign-out or invalidation -> session removed

### Password reset lifecycle

1. admin triggers reset
2. temporary password generated and hashed
3. user signs in with temporary password
4. user must choose a new permanent password
5. reset state consumed and audit event stored

### Authorization evaluation order

1. authenticate session
2. grant platform access if `system_admin`
3. otherwise check workspace membership
4. then check board membership for board-scoped actions
5. deny and audit when no matching scope allows the action
