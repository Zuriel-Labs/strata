# Quickstart and Acceptance: Kanban Productivity Suite

## Local prerequisites

- Work only in `/Users/chris/Documents/Github/strata-kanban-productivity`.
- Confirm the branch is `feat/kanban-productivity-suite` and its merge base is the recorded `origin/main` baseline.
- Keep the primary checkout and abandoned prior-agent worktree untouched.
- Use a disposable SQLite database for tests; never point tests at production data.

## Red → Green → Refactor loop

For each user story:

1. Add focused unit/integration/contract tests and capture the expected failure.
2. Implement the smallest coherent server and client slice.
3. Run the focused tests until green.
4. Refactor without changing behavior and rerun the focused tests.
5. Mark the corresponding task and acceptance criterion with evidence.

## Local commands

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm run test:ci
```

The final `npm run test:ci` is mandatory even when its component gates have already run.

## Acceptance matrix

### Issue #15 — modern card reordering

- Reorder first→middle, middle→last, and last→first in one list.
- Move a card between lists and back.
- Confirm neighboring cards animate to expose a visible gap and the dragged card uses an overlay/lifted state.
- Start a drag from the title, labels, badges, and blank card area; confirm there is no separate handle.
- Short-click and short-tap without drag and confirm details open on release; hold/move/drop and confirm details do not open.
- Cancel a drag and force a failed request; both restore the exact previous order.
- Reload and verify the committed order persists with compact unique positions.
- Verify filtered/hidden cards are not lost or misordered by a visible-card drag.
- Move a card into every position of a destination already containing two or more cards; confirm no blank screen, uncaught error, missing card, or incorrect persisted position.
- Reorder lanes first→middle, middle→end, and end→first from the title area with pointer and held touch.
- While moving a lane, confirm horizontal displacement exposes the destination gap, the source becomes a faded dropped-state placeholder, and a title-styled lane overlay follows the pointer/finger.
- Cancel and force a failed lane move; verify exact rollback. Complete a move, reload, and verify exact lane persistence. Confirm users without board-management authority have no lane activator.

### Issue #16 — A–Z and Z–A sort

- Open the list corner menu and confirm `Sort A to Z`, `Sort Z to A`, separator, and `Archive list` are present.
- Sort mixed case, numeric suffixes, punctuation, blank-trimmed-like titles, and duplicate collation values in both directions.
- Reload and confirm persistence.
- Manually drag after sorting and confirm ordering is manual again.
- Force a failed request and confirm local rollback plus visible error.

### Issue #17 — duplicate card

- Duplicate from the card modal, including a source with formatted description, labels, members, checklist content, due date, and attachment metadata.
- Confirm the copy appears immediately after the source with ` (copy)` in its title.
- Confirm fresh nested IDs, independent edits, copied current due-date completion, and exclusions for comments/activity/archive/prior history.
- Confirm watching persists only when the duplicating user is both assigned to and watching the source; every other case starts not watched.
- Confirm exactly one `card_created` automation execution and one audit event.
- Verify forbidden users cannot duplicate.

### Issue #18 — manage labels inside a card

- From the card modal create, rename/recolor, and delete labels without opening the board manager.
- Confirm Cancel makes no board/card changes and Save updates every open surface.
- Assign a newly created label to the current card.
- Delete an assigned label and verify card/automation references are cleaned.
- Verify validation, duplicate IDs, invalid colors, RBAC denial, and persistence-failure handling.
- Leave a new label unsaved beyond background refresh intervals in both managers; confirm it never disappears before Save/Cancel.
- In the card label picker, click an `Added` row and confirm it immediately becomes `Add` and removes the assignment; click it again and confirm the assignment returns. Force a failed update and confirm rollback plus feedback.

### Issue #19 — rich-text descriptions

- Create and edit paragraphs, line breaks, headings, bold, italic, strike, inline code, code block, blockquote, bullet list, ordered list, link, and horizontal rule.
- Save, close, reopen, reload, and re-edit; verify the structure and marks are retained.
- Convert an existing plain multiline description and confirm its lines remain readable.
- Paste formatted and malicious content; confirm unsupported nodes/attributes/protocols are rejected or normalized and no HTML executes.
- Verify empty content, maximum size/depth/node limits, failed save rollback, read-only view links, focus behavior, and responsive layout.
- Compare edit/view styling for lists, headings, quote, code block, inline code, link, and separator; confirm read-mode links are clickable without entering edit mode.
- Confirm dedicated Undo/Redo toolbar buttons are absent and native platform undo/redo still works in the editor.

### Issue #22 — restored card checklists

- Open existing checklist data and verify progress, titles, items, and completion state.
- Create a checklist, add items, toggle complete/incomplete, delete an item, refresh, and confirm persistence.
- Complete the final item and confirm exactly one checklist-complete automation transition.
- Force a failed mutation and confirm authoritative recovery with visible feedback.
- Confirm read-only users can view but not mutate and a duplicate edits independently.

### Issue #21 — archive integrity and archived-list deletion

- Archive a populated list and independently archive a card from an active list.
- Confirm the populated list appears once, its children do not appear separately, and the independent card appears once.
- Confirm archived lists and independent cards both expose confirmation-gated Delete where authorized.
- Permanently delete the list and verify only it and its child cards disappear after refresh.
- Verify System Admin, Workspace Admin, and Board Admin access; deny lower roles and direct deletion of active lists.
- Force delete/restore failures and confirm both Archive surfaces recover authoritatively with actionable feedback.
- At 390×844, 768×600, and 1280×720, open an archived-list delete prompt and confirm the warning, Cancel, and Delete actions are fully visible or reachable inside the Management dialog without clipping outside the viewport.

## Canary release procedure

1. Commit the complete source tree and push the feature branch.
2. Update the existing PR so it links all seven Issues. Do not merge it.
3. Build from the clean committed source SHA using an immutable canary tag and record the registry digest.
4. Record the pre-change canary image and health baseline.
5. In the canonical homelab repository, change only `apps/strata-canary/values.yaml`, commit that path, and push to Gitea.
6. Wait for ArgoCD to report Synced/Healthy and for the deployment rollout to complete. Verify the running image digest and application health.
7. Create a dedicated canary-only login without exposing its password, then execute every acceptance scenario against `https://strata-canary.eaglepass.io`.
8. Publish the exact candidate tuple: source commit SHA, immutable image digest, and homelab canary commit SHA.
9. Add validation evidence to the PR and Issues; replace `agent:working` with `agent:canary` and `agent:awaiting-feedback`.
10. Stop with production unchanged and wait for explicit human approval of the exact candidate.

## Rollback

- If canary validation fails, revert only the canary image value to the recorded previous image via a new Gitea commit and wait for ArgoCD health.
- The additive database column may remain. The old application reads the synchronized plain `description` and ignores `description_json`.
- Never edit the production chart or deploy the candidate to the production namespace before explicit approval.
