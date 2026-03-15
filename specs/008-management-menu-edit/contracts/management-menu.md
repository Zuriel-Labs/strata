# API Contracts: Management Menu Inline Editing

## PATCH /api/workspaces/:workspaceId

- **Purpose**: Persist a renamed workspace from the Management overlay.
- **Auth**: Authenticated user with workspace management permission.
- **Request Body**:

```json
{
  "name": "Operations"
}
```

- **Validation**:
  - `name` is required.
  - `name` must contain at least one non-whitespace character after trimming.
- **Success Response** `200`:

```json
{
  "id": "w1",
  "name": "Operations",
  "description": "...",
  "visibility": "private"
}
```

- **Failure Responses**:
  - `400` invalid payload
  - `403` access denied
  - `404` workspace not found

## PATCH /api/boards/:boardId

- **Purpose**: Persist a renamed board from the Management overlay.
- **Auth**: Authenticated user with board management permission.
- **Request Body**:

```json
{
  "title": "Platform Launch"
}
```

- **Validation**:
  - `title` is required.
  - `title` must contain at least one non-whitespace character after trimming.
- **Success Response** `200`:

```json
{
  "id": "b1",
  "title": "Platform Launch",
  "workspaceId": "w1",
  "visibility": "workspace",
  "color": "#6366f1",
  "starred": true,
  "labels": []
}
```

- **Failure Responses**:
  - `400` invalid payload
  - `403` access denied
  - `404` board not found
