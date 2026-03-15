# Data Model: Card Attachment Actions

## Entities

### Attachment
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Stable attachment identifier |
| `name` | string | User-facing filename or link label |
| `kind` | `'file' \| 'link'` | Distinguishes uploaded files from links |
| `url` | string? | External link URL for links or persisted browser-retrievable payload for uploaded files |
| `size` | number? | Uploaded file size in bytes |
| `mimeType` | string? | Uploaded file MIME type used for metadata and view eligibility |
| `createdAt` | string | Attachment creation timestamp |

## Validation Rules

- Link attachments require a valid URL and do not use MIME-based file actions.
- Uploaded file attachments require `name`, `kind`, and `createdAt`; `url` is expected when download or view actions are available.
- View eligibility is derived from `kind === 'file'`, a present `url`, and a browser-viewable MIME type.

## State Transitions

1. User selects one or more local files.
2. Client reads each file into a persisted browser-retrievable payload.
3. Client stores attachment metadata plus payload in card state and persists the updated attachment array.
4. Card modal renders action set per attachment:
   - Link: existing open-link affordance plus remove.
   - File with payload: download, optional view, remove.
