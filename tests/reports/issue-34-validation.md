# Issue #34 Validation Report

Date: 2026-08-26
Source baseline: `268518e09dbbcde4f8f186d2bdc97d92bed8a876` (`origin/main`)
Branch: `fix/scalable-label-management`

## Acceptance coverage

- A newly added sixth label uses a browser-generated UUID and cannot collide with a persisted `id_101` label.
- The default platform policy is 12 labels per Board. The API accepts 12 and rejects a new thirteenth identity atomically.
- System Administrators can configure a whole-number limit from 1 through 100 in Administration → System Settings.
- Workspace Administrators, Board Administrators, Members, Observers, out-of-scope users, and unauthenticated actors cannot change the platform policy.
- Lowering the policy does not delete or rewrite existing labels. Grandfathered Boards may rename, recolor, and delete existing definitions, but cannot add a new identity until below the limit.
- Both Board-level and in-card label managers receive the effective policy and Board revision.
- Stale editors receive `LABEL_VERSION_CONFLICT`; their draft remains visible, blind retry is disabled, and an authoritative reload action is available.
- Label replacement, dependent card/automation cleanup, revision increment, and audit creation remain one transaction.
- Duplicate IDs are rejected atomically with a safe machine-readable error; the non-mutating inventory helper can identify any legacy duplicate IDs.

## Red → Green evidence

1. Initial focused Red run:
   - `server/tests/foundation.test.ts`: failed with `no such table: platform_settings`.
   - `src/components/LabelEditor.test.tsx`: failed with duplicate React key `id_101` and mirrored sixth/third row controls.
2. First Green run:
   - `npx vitest run server/tests/foundation.test.ts src/components/LabelEditor.test.tsx --reporter=dot`
   - 2 files, 10 tests passed.
3. Compatibility Red run exposed six existing label-route callers without `expectedRevision`; tests and contract callers were deliberately migrated to the revisioned API.
4. Focused policy/admin/editor Green run:
   - 3 files, 56 tests passed.
5. Focused role matrix rerun after capability-shape migration:
   - 2 files, 35 tests passed.
6. Focused Playwright acceptance:
   - `tests/e2e/scalable-label-management.spec.ts`: 1 passed.

## Final automated gates

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test`: passed in the final CI run, 43 files / 316 tests.
- `npm run build`: passed; client and server artifacts built. Vite emitted the existing large-chunk advisory, not a build failure.
- `npm run test:e2e`: passed, 23/23 Chromium journeys.
- `npm run test:ci`: passed end to end: lint → 316 tests → build → 23 browser journeys.
- `npm audit --audit-level=moderate`: passed, 0 vulnerabilities.
- `git diff --check`: passed before the final report update and must be rerun at commit handoff.

One full Playwright run initially attached to an intentionally running manual visual-test server because `reuseExistingServer` is enabled locally. That run failed authentication against the separate visual-test database. The manual server was stopped and the complete isolated E2E suite was rerun successfully at 23/23; this was test-environment isolation, not an application defect.

## Migration and data integrity

- Fresh schema: singleton policy row is created at 12 and Boards start at revision 0.
- Repeated schema initialization: no duplicate column/row and no label rewrite.
- Simulated legacy schema: missing `boards.labels_revision` is added at 0; invalid legacy policy value is repaired to 12.
- Label JSON before/after legacy migration is byte-for-byte equivalent in the regression test.
- `PRAGMA quick_check`: `ok`.
- `PRAGMA integrity_check`: `ok`.
- Policy update persists in SQLite and is returned by subsequent session hydration.

## Visual and accessibility checks

- Desktop: dialog hierarchy, row color/name/delete controls, count, Add, Cancel, and Save are visible and coherent.
- Tablet (768×1024): modal width, header, rows, and fixed actions remain fully contained with no horizontal clipping.
- Phone (390×844): dialog fits the viewport; label rows scroll independently; count and actions remain reachable.
- Twelve-row phone state: Add is disabled, copy reads “12 of 12 labels used,” and existing row controls remain enabled.
- Interactive controls used by the acceptance journey have at least 44px height.
- Keyboard-accessible semantic buttons, labels, `aria-live` policy feedback, alert errors, and disabled states are retained.

## Independent review

- Correctness: reviewed limit transitions, ID uniqueness, stale writes, duplicate-ID rejection, and both label entry points.
- Security/RBAC: platform mutation is server-authorized for System Administrators only; denial is audited; UI visibility is not the authority boundary.
- Data integrity: no lowering-time deletions; conditional revision write and dependent cleanup are transactional; failed cleanup rolls back labels and audit data.
- UX/accessibility: count/limit copy, bounded scrolling, touch targets, pending/error/success states, impact warning, and conflict recovery reviewed.
- Performance: policy reads are one singleton lookup per session/request; impact calculation is one bounded aggregate query; no per-label API fan-out was introduced.
- Maintainability: no runtime dependency was added; shared types and existing label editor/service paths remain authoritative.

No unresolved critical, high, or medium findings remain. Production deployment is explicitly out of scope; the next authorized environment is Canary after exact-head PR review and CI.
