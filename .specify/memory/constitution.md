# Strata Engineering Constitution

> This constitution turns the Strata engineering operating standard into durable gates for specification, implementation, review, and release.

## Core Principles

### I. Spec-First, Issue-Traceable Delivery

Every behavior change MUST begin with an independently testable user story, explicit acceptance scenarios, bounded non-goals, and traceability to its GitHub Issue. Specifications define what and why; plans and tasks define how.

**Compliance**: No application implementation begins until `spec.md`, requirements-quality checklists, `plan.md`, and `tasks.md` exist and pass the cross-artifact audit.

### II. Strict Red → Green → Refactor

New behavior, bug fixes, migrations, and refactors MUST start with a focused test that fails for the expected reason. The smallest correct implementation follows, then refactoring while all focused and regression tests remain green.

**Compliance**: Task lists name the failing test before its implementation task. Completion requires the repository-native typecheck, lint, unit/integration, build, E2E, and full CI gates applicable to the changed behavior.

### III. Security, Authorization, Audit, and Data Integrity by Default

Every external boundary MUST be validated. UI visibility never substitutes for server authorization. Mutations preserve RBAC and appropriate audit evidence. Database changes MUST include an idempotent startup migration, legacy-data preservation tests, failure behavior, and a documented rollback/compatibility model.

**Compliance**: Specifications and contracts cover valid input, invalid input, missing resources, permission denial, repeated/concurrent operations, safe error responses, audit effects, and data integrity.

### IV. Accessible, Responsive, Failure-Honest UX

All interactive behavior MUST work with keyboard and pointer input and, where interaction semantics require it, touch and screen-reader feedback. Changed UI MUST define loading, empty, error, success, focus, responsive, light/dark theme, and reduced-motion behavior. Optimistic UI MUST recover to authoritative state on failure.

**Compliance**: Component and browser tests cover applicable interaction modes and viewports. Visual review is performed at 375px, 768px, and 1280px without claiming accessibility or cross-browser coverage that was not actually executed.

### V. Clean, Reviewable, Reproducible Source

Issue work MUST start from current `origin/main` in an isolated worktree. User-owned changes are preserved. Commits remain cohesive and conventional. Deployed images MUST be built from a clean committed source tree and identified by immutable digest.

**Compliance**: Before image build, record source commit, clean worktree status, dependency lockfile, build result, image tag, and digest. A source, dependency, merge, rebase, conflict-resolution, or included-documentation change creates a new candidate.

### VI. Canary-First GitOps and Explicit Production Approval

Every release candidate MUST deploy first to `strata-canary` through the canonical homelab repository, Gitea `master`, and ArgoCD. Canary approval applies only to the exact source tree, immutable image digest, and canary deployment commit. Production MUST NOT change until the user explicitly approves that exact candidate.

**Compliance**: Canary delivery verifies ArgoCD sync/health, rollout, pods, events, logs, ingress/TLS, `/api/health`, authentication, affected user journeys, and repository-wide homelab health. Production remains unchanged before approval.

### VII. Documentation and Evidence Are Part of the Product

Specifications, plans, tasks, API contracts, migration notes, test reports, PR evidence, rollout/rollback notes, and canary handoff material MUST match the delivered implementation. Claims MUST name the command or live check that produced the evidence.

**Compliance**: Phase 9 creates a truthful test report containing only executed categories, and the canary handoff identifies residual risks and environment limitations.

## Mandatory Gates

1. Requirements-quality checklists complete before planning.
2. Cross-artifact analysis has zero critical, high, or medium findings before implementation.
3. Focused tests demonstrate Red before Green for each behavior slice.
4. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e`, and `npm run test:ci` pass before a canary candidate is handed off.
5. Schema changes pass legacy migration, idempotence, and data-preservation tests.
6. A clean committed source tree produces one immutable candidate image.
7. Canary and the repository-wide homelab gate are green before requesting user approval.
8. Production remains unchanged until explicit approval of the current candidate tuple.

## Governance

### Amendment Process

Principle or gate changes require explicit stakeholder discussion, a semantic version increment, rationale, and review of affected specifications. Capability history may be updated after successful delivery without weakening existing gates.

### Compliance Review

- Phase 1 resolves this constitution and all repository instructions.
- Phase 4 records compliance in the plan.
- Phases 6 and 7 audit and remediate deviations.
- Phase 9 records newly validated capabilities and test evidence.

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-08-24 | Initial Strata-specific constitution derived from repository and release governance. |

**Version**: 1.0.0 | **Ratified**: 2026-08-24 | **Last Amended**: 2026-08-24
