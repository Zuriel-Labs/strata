# API Contract: Default Workspace/Board Preferences

## PATCH /api/auth/preferences

### Request

```json
{
  "themePreference": "dark" | "light",
  "defaultWorkspaceId": "uuid" | null,
  "defaultBoardId": "uuid" | null
}
```

All fields are optional. Only provided fields will be updated.

### Response (200 OK)

```json
{
  "user": {
    "id": "uuid",
    "name": "string",
    "initials": "string",
    "color": "string",
    "themePreference": "dark" | "light",
    "username": "string",
    "platformRole": "system_admin" | "user",
    "mustChangePassword": false,
    "defaultWorkspaceId": "uuid" | null,
    "defaultBoardId": "uuid" | null
  }
}
```

### Validation Errors

**400 Bad Request** - Invalid workspace or board ID:
```json
{
  "message": "Invalid default workspace or board."
}
```

**400 Bad Request** - Board not in workspace:
```json
{
  "message": "Default board must belong to the selected workspace."
}
```

**400 Bad Request** - Board set without workspace:
```json
{
  "message": "Cannot set default board without a default workspace."
}
```

---

## GET /api/auth/session

### Response (200 OK)

The session payload returns the user's configured defaults AND the resolved current workspace/board:

```json
{
  "status": "authenticated",
  "user": {
    "id": "uuid",
    "name": "string",
    "initials": "string",
    "color": "string",
    "themePreference": "dark" | "light",
    "username": "string",
    "platformRole": "system_admin" | "user",
    "mustChangePassword": false,
    "defaultWorkspaceId": "uuid" | null,
    "defaultBoardId": "uuid" | null
  },
  "permissions": {
    "isSystemAdmin": false,
    "workspaceMemberships": [...],
    "boardMemberships": [...]
  },
  "appState": {
    "currentWorkspaceId": "uuid",
    "currentBoardId": "uuid",
    ...
  }
}
```

### Default Resolution Logic

- `currentWorkspaceId` and `currentBoardId` in `appState` reflect the user's defaults if set
- If `defaultWorkspaceId` is set but `defaultBoardId` is not, `currentBoardId` defaults to the first board in that workspace
- If no defaults are set, the existing alphabetically-first behavior is preserved
