# Quickstart: Board Member Card Collaboration

## Local validation roles

With seeded data enabled:

- `priya`: Member on Boards `b1` and `b3`.
- `marcus`: explicit Board Admin on `b1`, Observer on `b2`.
- `alex`: Workspace Admin for `w1`, without Board membership.
- `admin`: System Admin.

Never reuse seeded credentials in Canary. Create a purpose-specific Canary Member account through the Admin panel and assign it Member membership on a disposable test Board.

## Integration scenarios

1. As Priya on `b1`, create, edit, move, duplicate, assign eligible members, update due date/labels/description/checklists/attachments/watch, and add/edit own comment.
2. As Priya, verify list move/title/sort/archive, card archive/delete, label management, automation management, another author's comment edit, and all comment deletion are denied.
3. As Marcus on observed `b2`, verify card mutations are denied; as Marcus on administered `b1`, delete any comment and edit an existing automation.
4. As Alex on a `w1` Board, perform the administrator-only comment deletion and automation edit without Board membership.
5. As System Admin, perform the same actions on any Board.
6. Attempt cross-Board card movement, observer/inactive/non-member assignment, invalid comment text, comment author spoofing, and out-of-scope automation editing.

## Project-native commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm run test:ci
```

## Canary verification

- Confirm exact image tag/digest, ArgoCD revision, `Synced Healthy`, pod readiness/restarts, events/logs, ingress/TLS, and `/api/health`.
- Exercise the diff-specific role matrix using separate Member and administrator sessions.
- Confirm production image and Deployment remain unchanged.
