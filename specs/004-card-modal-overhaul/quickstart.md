# Quickstart: Card Modal Overhaul

## Manual Verification Flow

1. Start the app with `npm run dev`.
2. Open a card that has only description/comments and confirm the modal shows:
   - list dropdown on the left
   - watch toggle and close button on the right
   - no overflow menu
3. Click the title, change it, press Enter, and confirm the new title persists.
4. Use the list dropdown to move the card and confirm the board updates without closing the modal.
5. Reveal Members, Labels, Due Date, and Attachments through the modal controls and confirm the sections render in the required order.
6. Confirm Description and Comments remain visible throughout.
7. Add the active user as a member to an unwatched card and confirm watch turns on automatically.
8. Remove the active user from that card and confirm watch turns off automatically.
9. Confirm no checklist controls or checklist content appear anywhere in the modal.

## Automated Validation Targets

- `src/store.test.ts` for membership/watch transitions
- `src/components/CardModal.test.tsx` for modal layout and interaction flows
- `tests/e2e/app.spec.ts` for a user-facing card modal regression
