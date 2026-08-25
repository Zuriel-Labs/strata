# Validation: Admin Audit Log Layout

Date: 2026-08-25
Issue: [#32](https://github.com/Broville/strata/issues/32)
Branch: `fix/admin-audit-layout`
Status: Local implementation validated; exact-commit Canary evidence pending

## Acceptance evidence

- The Administration header and tab navigation are non-shrinking flex items, so Audit Log overflow cannot collapse or obscure them.
- The dialog clips overflow at its rounded boundary while the existing `main` region remains the only vertical scroller.
- All Administration tabs remain visible and usable after the Audit Log is scrolled to its top, middle, and bottom.
- Narrow viewports retain the full tab height and use the existing horizontal tab scrolling behavior.
- Role and capability behavior, audit retrieval, event content, retention, and API limits are unchanged.

## Red-green record

The new browser regression reproduced the reported 1209 x 674 layout failure before implementation: switching from People to a 25-entry Audit Log collapsed the tab row from 47 px to 13.3125 px. After the modal chrome was made non-shrinking and the dialog overflow boundary was made explicit, the same geometry test passed at both 1209 x 674 and 390 x 640.

Automated coverage verifies:

- zero, one, and the maximum 25 returned audit events;
- stable header and tab bounding boxes;
- Audit content beginning at or below the tab boundary;
- content and scrollbar containment within the dialog;
- top, middle, and bottom Audit Log scroll positions;
- switching among People, Create User, Board Members, and Audit Log after scrolling;
- horizontal tab overflow without vertical collapse at the narrow viewport.

## Automated gates

| Gate | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run test` | PASS - 41 files / 300 tests |
| `npm run build` | PASS |
| `npm run test:e2e` | PASS - 22 Chromium journeys |
| `npm run test:ci` | PASS - lint, 300 tests, production build, 22 browser journeys |
| `npm audit --audit-level=high` | PASS - 0 vulnerabilities |
| `git diff --check` | PASS |

The first complete run exposed that the new E2E file ran before the existing bootstrap journey and rotated the seeded administrator password. The test was moved after the established stateful journeys without weakening its assertions. A later run encountered one transient timeout in an unchanged list-movement integration test; it passed immediately in isolation and in the final clean `npm run test:ci` run.

The Vite build retains its existing informational warning that the main JavaScript chunk exceeds 500 kB. No dependency, API, RBAC, database, or deployment configuration change is included.

## Canary gate

The next gate is to build one immutable image from the clean committed tree, deploy only that exact candidate to `strata-canary`, verify the rollout and health path, and provide the Issue #32 testing checklist. Production remains unchanged until the user explicitly approves this exact Canary candidate.
