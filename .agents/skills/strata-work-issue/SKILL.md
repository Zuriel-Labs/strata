---
name: strata-work-issue
description: "Execute an approved Strata GitHub Issue through PM Testing while enforcing the single-active-Issue pipeline. Use for work, start, initiate, complete, finish, implement, resume, or equivalent Issue execution requests."
---

# Work a Strata Issue

Read `AGENTS.md`, `.agents/strata-pipeline-policy.html`, the live Project, all active cards, the Issue, open PRs, Git state, and relevant code before acting.

## Approved Issue execution

Repository GitHub Issues are already approved scope. A PM request to work, start, initiate, complete, finish, implement, resume or otherwise execute an Issue has the same meaning: perform the approved work through the verified PM Testing handoff. Follow the shared policy's Approved Issue execution contract. Do not request another blueprint, specification, plan, task-list or slice-selection approval, or stop after producing one of those artifacts. Research, specify, plan and make routine implementation choices autonomously within Issue scope; do not turn agent-generated recommendations into extra approval gates. Complete all applicable Issue acceptance criteria rather than asking the PM to select each slice.

This intent does not satisfy the exact-candidate merge/Production gate. Preserve the one-active-Issue gate and explicit scope restrictions. Stop only for an actual blocker or a material unresolved decision that cannot be resolved from approved scope, source evidence and user instructions; do not manufacture uncertainty from routine implementation choices. A request limited to reading, discussing, auditing or planning an Issue remains limited to that request.

## Selection gate

- If more than one card is active, stop and report the conflict without changing code or metadata.
- If an active Issue exists, work only that Issue. Refuse a different requested Issue unless the PM first resolves the active card.
- If no Issue number and no active card exist, rank the Backlog and recommend the top three with impact, effort, risk, and rationale. Wait for PM selection.
- A requested Issue must be open and in Backlog unless it is the existing active Issue. On Hold may resume only when the PM explicitly requests it.
- The PM's selection or resume request is the decision gate. The agent performs the Project transition and readback; never ask the PM to move the card.

## Start and implement

1. As the agent-owned Project transition, move the selected Issue to In Progress, assign only `brimdor`, and immediately read back Status, assignment, metadata, and the one-active-Issue count before editing code.
2. Start from current `origin/main` on `issue/<number>-<short-slug>`. Preserve user-owned work and fail closed if branch creation would mix unrelated changes.
3. Diagnose before editing. Research and maintain the specification/plan as needed without another approval round for approved scope. Follow the existing Vite/React client, Express server, Zod boundary, RBAC policy, audit, and SQLite patterns relevant to the Issue.
4. Implement the smallest coherent solution with focused tests. Keep Issue scope and metadata current if evidence changes effort, impact, labels, or acceptance criteria.
5. Run focused checks while iterating, then the complete gates required by `AGENTS.md`.
6. Commit intended files, push the feature branch, and create or update a PR targeting `main`. The PR body must contain `Refs #<number>` and must not contain an auto-closing keyword.
7. Continue directly through `strata-review-issue`, remediation, exact-head CI and verified Canary to the numbered PM testing steps handoff. Do not stop for permission to begin QA or Canary preparation, and do not move to In Review merely because a PR exists. Stop at PM Testing for the current candidate's required approval; never infer merge or Production permission from an execution verb.

If the PM explicitly requests a pause, the agent moves the card to On Hold, preserves the Issue/branch/PR evidence, verifies that the active slot is released, and reports the resulting state. On resumption, the agent performs the In Progress transition after rechecking the slot.
