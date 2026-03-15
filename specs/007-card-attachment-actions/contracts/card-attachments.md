# Contract: Card Attachment Persistence

## Existing Endpoint

- **Method**: `PATCH`
- **Path**: `/api/cards/:cardId`
- **Purpose**: Persist updated card attachment arrays after adding or removing attachments.

## Attachment Payload Shape

```json
{
  "attachments": [
    {
      "id": "at_upload_1",
      "name": "architecture.pdf",
      "kind": "file",
      "url": "data:application/pdf;base64,JVBERi0x...",
      "size": 245123,
      "mimeType": "application/pdf",
      "createdAt": "2026-03-14T12:00:00.000Z"
    },
    {
      "id": "at_link_1",
      "name": "Release notes",
      "kind": "link",
      "url": "https://example.com/releases/onboarding-v2",
      "createdAt": "2026-03-14T12:01:00.000Z"
    }
  ]
}
```

## Notes

- The server continues accepting serialized attachment objects without a dedicated upload endpoint.
- Uploaded file actions are derived client-side from attachment fields already persisted on the card.
