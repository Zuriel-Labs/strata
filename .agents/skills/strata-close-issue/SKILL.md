---
name: strata-close-issue
description: "Close a Strata Issue only after exact candidate-specific PM approval to merge and deploy production: validate the candidate, squash-merge, promote the same digest, verify health and complete metadata. Generic work, start, initiate, complete or finish requests use strata-work-issue through PM Testing."
---

# Close a Strata Issue

Read `AGENTS.md`, `.agents/strata-pipeline-policy.html`, the sole active Issue, PR, approval message, candidate evidence, GitHub checks, and live Canary state.

Generic requests to complete, finish, work, start or initiate an Issue route through `strata-work-issue` to PM Testing. They do not authorize this skill's merge, Production or closure actions without the exact approval required below.

1. Require Status In Review and the exact phrase `Approved to merge and deploy production`, attributable to the PM through the Strata Discord/Issue synchronization record, for the current recorded head/tree, Zot digest, and Canary commit. Any mismatch or later change invalidates approval.
2. Confirm the PR targets `main`, contains `Refs #<number>` without auto-close syntax, has successful `Quality / verify`, no unresolved review threads, and is mergeable. Strata intentionally has no branch protection. Make the branch current with `main` only through a reviewed change that is redeployed to Canary.
3. Record the approved PR head tree, then squash-merge. Confirm the resulting `main` commit tree exactly equals the approved tree. If it differs, stop; do not deploy Production.
4. Invoke `strata-release-production` with the approved source head, tree, digest, merge commit, and Canary homelab commit. Production must not rebuild the image.
5. If Production fails, keep the Issue open and In Review. Perform the release skill's authorized non-destructive GitOps rollback; use a follow-up branch/PR on the same active Issue when source remediation is required.
6. Only after Strata Production deployment health, its persistent SQLite database and backup path are verified green, the Production skill has purged obsolete unreferenced Strata image manifests from Zot, and the retained Production digest is still pullable: update PR and Issue evidence, close the Issue, perform the agent-owned Project transition to Done, immediately read back the closed Issue and card, verify zero active Issues, and delete the merged feature branch when safe. Do not wait for Zot's delayed background blob garbage collection or repeat the Strata health audit solely because manifest cleanup occurred. Unrelated homelab health does not gate closure or authorize infrastructure investigation or repair. Never ask the PM to move the card.
7. The completion handoff must include numbered, change-specific `PM testing steps` for Production smoke and regression coverage, including the environment, exact actions, and expected results, even though Production verification is agent-owned and already complete.

A merged PR is not completion. Never close the Issue before Production verification.
