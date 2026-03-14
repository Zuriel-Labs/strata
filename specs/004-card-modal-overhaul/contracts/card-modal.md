# Card Modal Contract Notes

This feature does not add new server endpoints. It reuses existing card APIs with refreshed frontend behavior.

## Reused Endpoints

### `PATCH /api/cards/:cardId`
- Used for title updates, watch toggles, member changes, label changes, due date updates, description updates, and attachment persistence.
- No payload shape changes are required for this feature.

### `POST /api/cards/:cardId/move`
- Used by the top-bar list dropdown to move a card to a different list.
- Existing payload remains:

```json
{
  "toListId": "string",
  "toPosition": 0
}
```

## Behavioral Expectations

- The client continues to use optimistic UI updates for modal edits.
- Watch/member synchronization is handled in frontend state before persisting the resulting card payload.
