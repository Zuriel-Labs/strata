# Plan — Issue #6: Quality: Fix test environment

## Files to Change

### 1. `package.json`
- Bump `better-sqlite3` from `^12.6.2` to `^12.10.0`
- Remove `html-inline` devDependency (unused, pulls 3 critical CVEs)

### 2. `package-lock.json`
- Regenerate after dependency changes above

### 3. `src/test/setup.ts`
- Add `localStorage` polyfill for jsdom before `beforeEach` block
- Keep existing `window.localStorage.clear()` behavior for tests that do have storage set up

### 4. `src/test/setup.ts` (test verification)
- Ensure `vi` import is present (vitest global `vi` is available but `restoreAllMocks` needs it)

## Data Flow
- `src/test/setup.ts` runs before every client test via `vitest.config.ts` `setupFiles`
- `better-sqlite3` native module loads in server tests when they import database modules
- `html-inline` is a devDependency only; no runtime code references it

## New Files
- None

## Deleted Files
- None

## Dependencies Between Changes
1. `package.json` changes must happen first
2. `npm install` (or `npm audit fix`) regenerates `package-lock.json`
3. `src/test/setup.ts` changes can happen in parallel with (1) but only verified after `npm install`
4. Full test run validates everything
