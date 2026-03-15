# Research: Card Attachment Actions

## Uploaded file persistence
**Decision**: Persist uploaded file content in the attachment record using the existing optional `url` field so the stored value remains browser-retrievable after card save and reload.
**Rationale**: The current card update API already accepts serialized attachment arrays, so reusing that shape keeps the change small while fixing the missing download and view behavior.
**Alternatives Considered**: Temporary object URLs only (rejected - session-scoped), new backend file endpoints (rejected - disproportionate for this request).

## Browser view compatibility
**Decision**: Treat `image/*`, `text/*`, `audio/*`, `video/*`, `application/pdf`, `application/json`, and `application/xml` as inline-viewable uploaded file types.
**Rationale**: These MIME groups are commonly supported directly in browsers and provide a conservative rule for whether the view action should appear.
**Alternatives Considered**: Extension-driven detection only (rejected - weaker signal), universal view action (rejected - misleading for binary formats).
