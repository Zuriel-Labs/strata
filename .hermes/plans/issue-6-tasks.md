# Tasks — Issue #6: Quality: Fix test environment

## Task 1: Upgrade better-sqlite3 (est. 5 min)
- [ ] Bump `better-sqlite3` to `^12.10.0` in `package.json`
- [ ] Remove `html-inline` from `package.json` devDependencies
- Acceptance: `npm install` completes without `better-sqlite3` build errors

## Task 2: Add localStorage polyfill (est. 5 min)
- [ ] Add localStorage mock/polyfill to `src/test/setup.ts`
- [ ] Ensure existing `window.localStorage.clear()` call is guarded or polyfilled before it
- Acceptance: `window.localStorage` is defined in jsdom before any test runs

## Task 3: Regenerate lockfile and audit (est. 10 min)
- [ ] Run `npm install` in main checkout (native module compilation)
- [ ] Run `npm audit fix` to auto-resolve vulnerabilities
- [ ] Copy updated `package.json` and `package-lock.json` to worktree
- Acceptance: `npm audit` shows fewer than 13 vulnerabilities (ideally 5 or fewer)

## Task 4: Run full test suite (est. 15 min)
- [ ] Run `npm run test` — all 143 unit/integration tests pass
- [ ] Run `npm run typecheck` — passes
- [ ] Run `npm run lint` — passes
- Acceptance: Zero test failures, zero type errors, zero lint errors

## Task 5: Commit, push, and open PR (est. 5 min)
- [ ] Commit with conventional commit message
- [ ] Push branch to origin
- [ ] Open non-draft PR against `main`
- Acceptance: PR is open, CI checks can run

## Task 6: Apply exit label (est. 2 min)
- [ ] Verify no queued feedback on issue
- [ ] Apply `agent:pr-ready` label
- Acceptance: Label is present on issue #6
