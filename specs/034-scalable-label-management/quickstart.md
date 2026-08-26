# Quickstart: Scalable Label Management

## Development setup

1. Use the isolated fix/scalable-label-management worktree created from origin/main.
2. Install the locked dependencies with npm ci.
3. Keep runtime databases outside version control; use in-memory or disposable test files.

## Focused Red → Green slices

1. Identity regression:
   - Add a persisted id_101 fixture.
   - Prove a fresh new definition collides before the fix and is unique afterward.
   - Verify sixth-row typing and color changes affect only the sixth row.
2. Persistence and policy:
   - Prove fresh and repeated schema startup create one default-12 policy row.
   - Prove Board revisions are additive and existing labels_json bytes are unchanged by migration.
3. Policy API and RBAC:
   - Prove System Admin success, 1/100 bounds, invalid values, and every denied role.
   - Prove audit metadata and restart persistence.
4. Definition API:
   - Prove 12 accepted, 13th rejected, custom Board creation enforced, over-limit non-additive edit accepted, and new identity rejected.
   - Prove stale revision conflict leaves definitions and dependent references unchanged.
5. Shared UI:
   - Prove count/limit copy, Add state, 6/12/above-12 controls, conflict recovery, and Board/card parity.
6. Browser acceptance:
   - Create six labels across a reload; rename and recolor the sixth.
   - Fill all 12 default slots and verify a thirteenth is blocked.
   - Change the policy as System Admin and verify live propagation and persistence.
   - Lower below an existing Board count and verify no data loss.

## Required validation

- Targeted client, server, contract, and Playwright tests for each slice
- npm run typecheck
- npm run lint
- npm run test
- npm run build
- npm run test:e2e
- npm run test:ci
- npm audit
- git diff --check

## Canary acceptance

- Build from the exact clean reviewed commit and record image tag/digest.
- Deploy only to strata-canary through the Homelab Gitea chart and ArgoCD.
- Verify schema startup, database integrity, health, readiness, restarts, logs, events, TLS, and the exact running image.
- Exercise pointer, touch-sized/mobile, tablet, and desktop label managers at 6, 12, configured-above-12, and grandfathered-over-limit states.
- Confirm production remains unchanged.
