---
name: strata-create-issue
description: "Discuss, draft, prioritize, and create coherent Strata GitHub Issues in the Backlog. Use for new features, fixes, maintenance requests, or a laundry list that must be split into Issue-sized work."
---

# Create a Strata Issue

Read `AGENTS.md` and `.agents/strata-pipeline-policy.html`. Read the live Project, all open Issues, and open PRs before drafting.

1. Clarify the requested outcome only where repository evidence cannot resolve it. Split unrelated goals; combine changes only when they share one coherent outcome and validation path.
2. Search open and closed Issues and PRs for duplicates or absorbed scope.
3. Apply the shared Actionable Issue contract. Draft a feature or bug title and a complete HTML body with actor/current behavior, intended working outcome, implementation scope and design direction, data/API/permission rules, dependencies, failure/recovery behavior, measurable Acceptance criteria, Verification, PM testing steps, and Out of scope. Blueprint is a design convention; the deliverable remains a working feature or fix. Documentation and plans alone cannot satisfy its acceptance criteria. Human-facing Issue content must be HTML.
4. Propose exactly one `type:feature` or `type:bug` label, applicable `area:*` labels, Priority, Impact, Effort, assignee, milestone, and Project Status.
5. Show the complete draft and metadata to the PM. Do not create or edit GitHub state until the PM explicitly approves that exact draft.
6. After approval, create the Issue open and unassigned, add it to the private Zuriel-Labs `Strata` Project #2, set Status `Backlog`, and populate Priority, Impact, and Effort. Leave optional fields unset unless approved.
7. Read the Issue and Project card back. Verify title, body, labels, fields, open state, inactivity, and absence of accidental duplicates.

The agent performs and verifies the Backlog transition; never ask the PM to add or move the card. Issue creation never takes the active slot, creates a branch, or changes another card's Status.
