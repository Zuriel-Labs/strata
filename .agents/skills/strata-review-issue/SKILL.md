---
name: strata-review-issue
description: "Perform complete agent QA for the active Strata Issue, remediate all findings, deploy the exact candidate to Canary, and prepare the PM review checklist."
---

# Review a Strata Issue

Read `AGENTS.md`, `.agents/strata-pipeline-policy.html`, the active Issue, PR diff and history, acceptance criteria, current Canary state, and relevant test guidance.

1. Require the Issue to be the sole active card in In Progress. Keep it In Progress throughout agent QA and Canary preparation.
2. Review correctness, regressions, security, privacy, authorization, error paths, data migration, operations, accessibility, responsive behavior, and repository instructions in proportion to the diff.
3. Run focused tests, `npm run check`, `git diff --check`, migration rehearsal when applicable, and relevant Playwright coverage. Use Browser hands-on testing against a local instance for every affected flow at relevant desktop, tablet, and phone widths. This local browser QA is the required application-behavior gate.
4. Remediate every finding on the same Issue branch. Repeat the entire affected review surface until there are zero unresolved findings.
5. Ensure the PR is current, references the Issue without auto-close syntax, and the GitHub `Quality / verify` check succeeds for the exact committed head.
6. Invoke `strata-release-canary`. Do not request PM review until the exact candidate and Strata Canary deployment health are verified green. Unrelated homelab Applications, pods, nodes or storage health do not gate PM Testing; do not investigate or repair them for this handoff.
7. As the agent-owned Project transition, move the Issue to In Review and immediately read back the card and sole-active count. The handoff must include a numbered `PM testing steps` section derived from the actual diff, with the Canary URL, prerequisite state, exact actions, expected results, and baseline smoke and regression checks. Include PR head, Git tree, Zot digest, homelab Canary commit, and CI run. Never omit these testing steps because agent QA passed or the PM did not request them, and never ask the PM to move the card.
8. End every Canary review handoff with the exact phrase `Approved to merge and deploy production` in its own standalone fenced code block for direct copying. Inline text alone is insufficient. The phrase remains exact-candidate-specific and must be attributable through the Strata Discord/Issue synchronization record.
9. PM findings are blocking: the agent moves the card to In Progress and verifies it before remediation, creates a new candidate, and repeats. Silence or an earlier approval is not approval.

Wait for the exact phrase `Approved to merge and deploy production` for the current candidate. That phrase authorizes `strata-close-issue`.
