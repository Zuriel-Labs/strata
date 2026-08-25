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
- Perform a same-list move with the keyboard and hear/see meaningful instructions/status.
- Cancel a drag and force a failed request; both restore the exact previous order.
- Reload and verify the committed order persists with compact unique positions.
- Verify filtered/hidden cards are not lost or misordered by a visible-card drag.

### Issue #16 — A–Z and Z–A sort

- Open the list corner menu and confirm `Sort A to Z`, `Sort Z to A`, separator, and `Archive list` are present.
- Sort mixed case, numeric suffixes, punctuation, blank-trimmed-like titles, and duplicate collation values in both directions.
- Reload and confirm persistence.
- Manually drag after sorting and confirm ordering is manual again.
- Force a failed request and confirm local rollback plus visible error.

### Issue #17 — duplicate card

- Duplicate from the card modal, including a source with formatted description, labels, members, checklist content, due date, and attachment metadata.
- Confirm the copy appears immediately after the source with ` (copy)` in its title.
- Confirm fresh nested IDs, independent edits, copied current due-date completion, and exclusions for comments/activity/watching/archive/prior history.
- Confirm exactly one `card_created` automation execution and one audit event.
- Verify forbidden users cannot duplicate.

### Issue #18 — manage labels inside a card

- From the card modal create, rename/recolor, and delete labels without opening the board manager.
- Confirm Cancel makes no board/card changes and Save updates every open surface.
- Assign a newly created label to the current card.
- Delete an assigned label and verify card/automation references are cleaned.
- Verify validation, duplicate IDs, invalid colors, RBAC denial, and persistence-failure handling.

### Issue #19 — rich-text descriptions

- Create and edit paragraphs, line breaks, headings, bold, italic, strike, inline code, code block, blockquote, bullet list, ordered list, link, and horizontal rule.
- Save, close, reopen, reload, and re-edit; verify the structure and marks are retained.
- Convert an existing plain multiline description and confirm its lines remain readable.
- Paste formatted and malicious content; confirm unsupported nodes/attributes/protocols are rejected or normalized and no HTML executes.
- Verify empty content, maximum size/depth/node limits, failed save rollback, read-only view links, focus behavior, and responsive layout.

## Canary release procedure

1. Commit the complete source tree and push the feature branch.
2. Open one PR linked to all five Issues. Do not merge it.
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
