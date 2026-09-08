# AGENTS.md — Strata Engineering Operating Standard

This is the operating contract for autonomous and human-assisted agents working on **Strata**. Optimize for durable user value, operational safety, security, accessibility, maintainability, and trustworthy delivery—not activity, superficial speed, or unverified claims.

## 1. Project Identity and Non-Negotiables

- **Organization:** Zuriel-Labs
- **Repository:** `strata` (`github.com/Zuriel-Labs/strata`)
- **GitHub Project:** organization-owned private Project `Strata`, number `2`
- **Product:** Strata
- **Current deployment stage:** Canary — `https://strata-canary.eaglepass.io`
- **Primary stack:** TypeScript 5.9, React 19, Express 5, better-sqlite3, Zod v4, Vite, Vitest, Playwright

### Safety boundaries

1. **Never merge or deploy to Production without exact candidate-specific PM approval through the Strata Discord/Issue synchronization record.** The required phrase is `Approved to merge and deploy production`. A green test suite or successful Canary validation is not approval.
2. **Deploy only from reviewed, reproducible source.** Do not build or deploy from a dirty checkout, an uncommitted experiment, or an unverified branch.
3. **Do not weaken auth, RBAC, validation, audit logging, security headers, tests, or CI to make work appear complete.** Treat a regression in any of these as a release blocker.
4. **Never expose secrets, access tokens, production data, session identifiers, or private infrastructure details in code, issues, PRs, reports, screenshots, or logs.**
5. **Prefer read-only investigation before remediation** for health checks, incidents, and reports. State impact, evidence, uncertainty, and proposed remediation before making changes unless the user has explicitly authorized action.

### Authority and source of truth

- The Project Manager (PM) is the human GitHub user `brimdor` (Chris). The agent performs implementation, Project movement, validation, and deployment; PM approval is the merge-and-Production authorization gate.
- Canonical repository skills are under `.agents/skills/`. Always use the relevant `strata-*` skill for Issue, review, release, or pipeline work.
- Five shared frontend skills also live under `.agents/skills/`: `design-taste-frontend`, `awesome-design`, `image-to-code`, `web-design-guidelines`, and `playwright-cli`. They support product work but never replace a `strata-*` pipeline skill, override this file, or broaden the current Issue.
- `.agents/strata-pipeline-policy.html` is the shared workflow policy. Skill instructions may narrow a workflow but must not contradict it.
- `AGENTS.md` is the durable repository instruction source. `CLAUDE.md` and `GEMINI.md` import it; do not duplicate these instructions into tool-specific files.
- Preserve unknown user-owned changes. Never reset, restore, clean, stash, overwrite, commit, or deploy them without explicit direction.
- Strata intentionally has no branch protection or repository ruleset. Do not add either unless the PM explicitly changes this decision. The absence of server enforcement never weakens the required process or evidence.

### Pipeline invariant

- Exactly one Issue may be active. Active means Project Status `In Progress` or `In Review`.
- Before any Issue or code work, read the live Project, all open Issues, open PRs, the current branch/head, and the selected Issue. Fail closed on missing or conflicting metadata.
- The agent owns all Project Status movement: `Backlog`, `On Hold`, `In Progress`, `In Review`, and `Done`.
- Never ask the PM to move a Project card or repair pipeline metadata. The PM selects work, requests pause/resume, reports Canary findings, and grants approval; the agent performs and immediately reads back the corresponding transition.
- `On Hold` is inactive and may be used only when the PM explicitly requests it.
- Keep Status, Priority, Impact, Effort, labels, assignee, Issue state, branch, and PR reference aligned. Active Issues are assigned only to `brimdor`; Backlog Issues are open and unassigned; Done Issues are closed.
- Backlog work is selected by the PM. Without an Issue number and with no active Issue, recommend the top three Backlog Issues and wait for selection.

### Required workflow skills

- New work: `strata-create-issue`.
- Backlog audit: `strata-audit-issues`.
- Implementation: `strata-work-issue`.
- Agent QA and Canary preparation: `strata-review-issue`.
- Canary release: `strata-release-canary`.
- Approved merge, Production release, and closure: `strata-close-issue` with `strata-release-production`.
- Read-only pipeline audit: `strata-pipeline-health`.
- Skill changes: `strata-maintain-skills`.

## 2. Repository Map

- `src/` — React client: components, hooks, services, and state. Import alias `@/*` maps to `./src/*`.
- `server/src/` — Express API: routes, database, auth, RBAC, and audit behavior.
- `server/data/` — SQLite data; treat as stateful and never casually overwrite, delete, or commit runtime data.
- `src/**/*.test.tsx` — client unit/component tests.
- `server/tests/` — server integration tests.
- `tests/contract/` — API contract tests.
- `tests/e2e/` — Playwright end-to-end tests.
- `specs/` — feature specifications and OpenAPI contracts; keep implementation, tests, and relevant contracts aligned.

## 3. Verified Commands

Run commands from the repository root unless the command itself specifies otherwise.

| Command | Purpose |
|---|---|
| `npm run dev` | Start client and server in watch mode. |
| `npm run typecheck` | Run TypeScript project type checking (`tsc -b`). |
| `npm run lint` | Run ESLint. |
| `npm run test` | Run Vitest unit and integration tests. |
| `npm run test:e2e` | Run Playwright end-to-end tests. |
| `PLAYWRIGHT_PORT=4183 npm run test:e2e` | Run Playwright on an alternate frontend port when the default `4173` is occupied. |
| `npm run build` | Typecheck, then build client and server artifacts. |
| `npm run test:ci` | Full local CI: lint → test → build → E2E. |
| `npm run skills:check` | Validate canonical skills, adapters, shared policy, and pipeline alignment. |
| `npm run pipeline:health` | Audit live Issue, Project, PR, CI, and candidate state read-only. |
| `npm run check` | Run skill alignment and the complete Strata CI suite. |
| `npm run build:push` | Repository-provided image build/push workflow; inspect its implementation and target before use. |

Do not claim a command passed unless you ran it and inspected its exit status. If a command cannot run, report the exact blocker and the test coverage that remains unverified.

## 4. Work Intake and Planning

Before changing code:

1. Read the relevant implementation, tests, contracts/specifications, and recent Git state.
2. Translate the request into observable behavior, acceptance criteria, non-goals, authorization boundaries, and affected user roles.
3. Identify affected layers: UI, API, validation, RBAC, audit trail, database/schema, contracts, deployment, documentation, and observability.
4. Investigate existing patterns before introducing abstractions, dependencies, or alternate conventions.
5. Select the smallest safe change that meets the actual requirement. Avoid speculative features and unrelated refactors.
6. For ambiguous, high-impact, destructive, or production-affecting decisions, stop and obtain the needed clarification or approval.

Research must be evidence-based: use primary documentation, the repository, tests, contracts, and reproducible experiments. Distinguish confirmed facts from assumptions and recommendations.

## 5. Implementation Standards

### TypeScript, React, and Express

- Use strict, explicit TypeScript types; avoid `any`, unsafe casts, and non-null assertions unless their safety is locally proven.
- Use ES module imports/exports. Use `import type` for type-only imports. Default exports are allowed only for React components.
- Keep components accessible, keyboard-operable, and semantically structured. Preserve focus management, labels, errors, and loading/empty states.
- Keep UI logic, API clients, domain logic, and persistence concerns separated. Prefer small, cohesive modules with clear ownership.
- Validate every external/request boundary with Zod. In Express routes, use `safeParse` and return an intentional early `400` response for invalid input.
- Enforce authorization through `server/src/rbac/policies.ts`; never substitute UI visibility for server-side authorization.
- Preserve audit behavior for security-sensitive and state-changing operations. Verify that new mutation paths have appropriate authorization and audit coverage.
- Make database changes deliberately: assess migration/compatibility needs, constraints, rollback behavior, and tests before changing persisted state.
- Use existing shadcn/ui components under `src/components/ui/` and Tailwind conventions before adding new primitives or dependencies.

### Quality and maintainability

- Prefer readable, direct code over cleverness. Name behavior and domain concepts precisely.
- Keep diffs narrowly scoped. Do not mix formatting churn, generated artifacts, dependency upgrades, or opportunistic cleanup with a feature/fix unless necessary and documented.
- Consider failure paths, invalid input, authorization denial, concurrent/repeated requests, boundaries, and backwards compatibility—not only the happy path.
- Do not silently swallow errors. Return safe, actionable errors to callers and retain enough server-side context for diagnosis without leaking sensitive data.

## 6. Test-First Delivery and Quality Gates

Use strict Red → Green → Refactor for new behavior, bug fixes, refactors, and behavior changes:

1. Write one focused test for one observable behavior.
2. Run it and confirm it fails for the expected missing or incorrect behavior—not due to a typo or broken setup.
3. Implement the smallest correct change.
4. Re-run the focused test and confirm it passes.
5. Refactor only while tests remain green; repeat in small vertical slices.

Tests must exercise real behavior where practical. Avoid tests that only assert mock implementation details. Cover applicable success, validation, permission, error, boundary, and regression cases.

### Required validation before declaring work complete

Run the strongest proportionate validation possible, at minimum:

- Targeted tests for the changed behavior.
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build` for changes that affect buildable application code.
- `npm run test:e2e` for user-facing, browser-flow, auth, or critical workflow changes.

Run `npm run check` before a PR/Canary handoff. Also run `git diff --check`, applicable migration rehearsal, dependency/security/privacy review, and hands-on local browser testing for every affected flow. If a required gate is not run, explicitly list it as **not run**, explain why, and do not represent the change as fully verified.

## 7. Review Standard

Every meaningful change requires an independent review mindset before handoff:

- **Correctness:** requirements and edge cases are satisfied; no broken existing behavior.
- **Security:** authorization, input validation, data exposure, injection risk, session/cookie handling, and audit effects are reviewed.
- **Data integrity:** schema/state changes preserve existing data and have safe failure/rollback considerations.
- **UX and accessibility:** coherent loading, error, empty, responsive, keyboard, focus, and screen-reader behavior.
- **Performance and operations:** no avoidable N+1 work, excessive payloads, uncontrolled retries, unbounded queries, or operational blind spots.
- **Maintainability:** focused diff, comprehensible names, no duplicated policy/business rules, relevant documentation/contracts updated.
- **Tests:** tests demonstrate the intended behavior and would fail if the change regressed.

Resolve review findings or document a conscious, approved exception with its risk and follow-up. `Quality / verify` must succeed for the exact PR head before Canary. PM review occurs against the verified Canary candidate; do not invent a second collaborator or a protected-branch review gate.

## 8. GitHub Issue and Pull Request Workflow

1. `strata-create-issue` shows the complete HTML Issue draft and proposed Status, Priority, Impact, Effort, labels, assignment, and milestone before obtaining exact-draft PM approval. It then creates the Issue open, unassigned, and in Backlog and reads it back. Use the repository YAML forms for human-created Issues; never create blank Issues.
2. `strata-work-issue` verifies the single-active slot, moves the selected Issue to In Progress, assigns only `brimdor`, and reads back the transition before code changes.
3. Start from current `origin/main` in an isolated worktree. Never implement Issue work in the primary checkout. Use `issue/<number>-<short-slug>`.
4. Keep commits small and reviewable using Conventional Commits. Push a focused branch and open a PR targeting `main`. The body must contain `Refs #<number>` and must not use an auto-close keyword.
5. `strata-review-issue` performs complete agent QA and local browser testing, remediates every finding, and requires exact-head `Quality / verify` before Canary.
6. After verified Canary deployment, the agent moves the Issue to In Review and provides numbered, change-specific PM testing steps plus the exact approval phrase in a standalone fenced code block.
7. PM findings move the Issue to In Progress before remediation and invalidate the previous candidate. A pause moves it to On Hold and releases the active slot.
8. `strata-close-issue` acts only on exact current-candidate approval, squash-merges, proves the merged tree equals the approved tree, promotes the exact Canary digest without rebuilding, verifies Production, performs safe image cleanup, closes the Issue, and moves it to Done.

## 9. Homelab Release Delivery

### Canonical delivery path

- **Canary URL:** `strata-canary.eaglepass.io`
- **Production URL:** `strata.eaglepass.io`
- **Namespaces:** `strata-canary`, `strata`
- **Registry:** `10.0.20.11:32309/strata`
- **Helm charts:** `/Users/chris/Documents/Github/homelab/apps/strata-canary/`, `/Users/chris/Documents/Github/homelab/apps/strata/`
- **Homelab source of truth:** Gitea `git.eaglepass.io/ops/homelab`
- **Deployment controller:** Argo CD auto-syncs Gitea `master`.

For Canary, build the exact committed PR head once from a clean Git archive on the local development workstation, never on a Kubernetes node. Target `linux/amd64`, push the source-derived tag to Zot, resolve the registry digest, update only the Canary chart image tag/digest, and push only that GitOps change to Gitea. Verify Helm, Argo revision/sync/health, the one `main` container, exact digest, readiness, zero restarts, logs/events, `/api/health`, external TLS/route, and whole-cluster health before In Review.

The candidate tuple is Issue, PR URL, full PR head SHA and Git tree, immutable Zot digest, and Canary homelab commit. Any source, dependency, image, schema, rendered configuration, rebase, merge resolution, or included documentation change invalidates approval.

Production reuses the approved Canary digest without rebuilding. Before promotion, confirm the previous image/configuration, `strata-data` PVC identity, database backup freshness, migration compatibility, SQLite integrity, and a precise non-destructive rollback commit. Preserve the Production hostname, session cookie, `SEED_DATA=false`, NFS storage, backup CronJob/PVC, TLS, network policy, and resources. Verify Production and whole-cluster health, then remove only unreferenced Strata manifests and confirm the retained digest remains pullable. A safe GitOps rollback is pre-authorized on failure; destructive schema or data restoration requires PM approval.

Production never rebuilds an approved candidate. After a successful Production update is fully green, image cleanup is mandatory.

## 10. Status, Discord, and Reports

- Coordinate product work in Discord channel **#strata**. The origin thread and `discord:thread`/`discord:last` labels retain synchronization context.
- New pipeline metadata uses Project Status, Priority, Impact, Effort, exactly one `type:*` label, and one or more `area:*` labels. Historical `agent:*`, `claimed_at`, and timestamp labels are legacy evidence; do not use them for new transitions or mass-delete them during unrelated work.
- Publish briefs, reports, and status updates to **pages.eaglepass.io** using the Liquid Glass design system: dark mode, self-contained HTML, and no `.glass::before` overlay.
- Every human-facing diagram or standalone document must be a Dark Mode HTML file. GitHub Issue bodies created by the pipeline must use HTML.

Status updates must be concise but decision-useful:

- What changed and why.
- Evidence: source revision, commands/tests run with results, review outcome, and Canary verification when applicable.
- Risks, unknowns, skipped checks, and required approvals.
- Clear next action and owner.

Never use vague completion language such as “should work” when evidence can be gathered. Say what was verified, what was not verified, and why.

Every implementation, remediation, Canary, Production, and completion handoff must include numbered, change-specific PM testing steps.
