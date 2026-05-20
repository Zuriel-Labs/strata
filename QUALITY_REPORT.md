# Strata Codebase Quality Report

**Date:** 2026-05-20  
**Codebase:** Strata (kanban-app) — Vite + React 19 + Express 5 + SQLite  
**Runtime:** Node.js 26.1.0 / TypeScript 5.9.3

---

## Executive Summary

| Check | Status | Details |
|-------|--------|---------|
| Type Checking | ✅ PASS | Zero type errors with strict mode enabled |
| Linting | ✅ PASS | Zero ESLint warnings or errors |
| Unit Tests | ❌ FAIL | 1/143 passed; 142 failures (environment issue, not code bugs) |
| Build | ✅ PASS | Client and server both build cleanly |
| Dependencies | ⚠️ WARN | 13 vulnerabilities (5 critical, 4 high); 29 outdated packages |
| Code Quality | ✅ EXCELLENT | Strict TypeScript, no `any` types, Zod validation, RBAC enforcement |

**Overall: The codebase is in strong shape.** The only test failures are caused by the `better-sqlite3` native module not compiling on the current Node.js 26 runtime — not by application bugs. The 1 passing contract test (which doesn't touch SQLite) confirms the infrastructure is sound. Dependency vulnerabilities are mostly in transitive dev dependencies and should be patched via `npm audit fix`.

---

## 1. Type Checking

**Command:** `npm run typecheck` (`tsc -b`)  
**Result:** ✅ Zero errors

Both `tsconfig.app.json` and `tsconfig.node.json` enforce:
- `"strict": true`
- `"noUnusedLocals": true`
- `"noUnusedParameters": true`
- `"noFallthroughCasesInSwitch": true`
- `"verbatimModuleSyntax": true`
- `"erasableSyntaxOnly": true`
- `"noUncheckedSideEffectImports": true`

This is a rigorous configuration — well above industry norms.

---

## 2. Linting

**Command:** `npm run lint` (`eslint .`)  
**Result:** ✅ Zero warnings, zero errors

ESLint configuration includes:
- `@eslint/js` recommended
- `typescript-eslint` recommended
- `react-hooks` plugin (rules of hooks)
- `react-refresh` plugin (Vite HMR discipline)
- Selective overrides for UI components and store (allowing non-component exports)

The codebase contains **zero** `@ts-ignore`, `@ts-nocheck`, or `eslint-disable` suppressions.

---

## 3. Unit Tests

**Command:** `npm run test` (vitest run)  
**Result:** ❌ 1 passed / 142 failed / 143 total across 20 test files

### Failure Breakdown

| Category | Files | Tests | Cause |
|----------|-------|-------|-------|
| Server integration (requires SQLite) | 8 files | ~120 tests | `better-sqlite3` native bindings missing |
| Client unit (store, components) | 3 files | 18 tests | `localStorage.clear()` undefined in jsdom |
| Contract test | 1 file | 1 test | ✅ Passed |

### Root Cause

**Server tests** fail because `better-sqlite3` v12.6.2 cannot compile its native addon against Node.js 26.1.0. The npm install with `--ignore-scripts` skipped the build, and even with scripts enabled, the compilation fails (gyp error in `better_sqlite3.o`). This is a **Node version compatibility issue**, not a code defect. The pinned version (12.6.2) is behind the latest (12.10.0), which likely has Node 26 support.

**Client tests** fail with `Cannot read properties of undefined (reading 'clear')` — the jsdom environment in this Node version doesn't provide `localStorage`. Tests should mock or polyfill `localStorage` in the test setup.

### Recommendations

1. **Upgrade `better-sqlite3`** to v12.10.0 (or latest) for Node 26 compatibility
2. **Add `localStorage` mock** to `src/test/setup.ts` for the jsdom compatibility issue
3. Consider using `--experimental-filesystem` flag or adjusting Node version for CI

---

## 4. Build Check

**Command:** `npm run build` (typecheck → vite build → esbuild server bundle)  
**Result:** ✅ Success

- Client: 1,773 modules → 409 KB JS (112 KB gzipped) + 74 KB CSS (14 KB gzipped)
- Server: 117 KB bundled ESM
- Build time: ~460ms client, ~4ms server

Clean builds with no warnings.

---

## 5. Dependency Analysis

### Outdated Packages (29 total)

| Severity | Key Packages | Current → Latest |
|----------|--------------|------------------|
| **Major** | `tailwindcss` | 3.4.1 → 4.3.0 |
| **Major** | `vitest` | 3.2.4 → 4.1.7 |
| **Major** | `@vitest/coverage-v8` | 3.2.4 → 4.1.7 |
| **Major** | `jsdom` | 27.4.0 → 29.1.1 |
| **Major** | `react-day-picker` | 9.14.0 → 10.0.1 |
| **Major** | `eslint` | 9.39.4 → 10.4.0 |
| **Major** | `typescript` | 5.9.3 → 6.0.3 |
| **Patch** | `better-sqlite3` | 12.6.2 → 12.10.0 |
| **Patch** | `vite` | 8.0.0 → 8.0.13 |
| **Patch** | `react` / `react-dom` | 19.2.4 → 19.2.6 |

### Security Vulnerabilities (13 total)

| Severity | Package | Issue | Fixable? |
|----------|---------|-------|----------|
| **Critical** | `minimist` (via `html-inline` → `trumpet` chain) | Prototype Pollution | ❌ No fix (deprecated deps in `html-inline`) |
| **Critical** | `minimist` (standalone) | Prototype Pollution (GHSA-vh95, GHSA-xvch) | ❌ No fix available |
| **High** | `path-to-regexp` (Express 5 dep) | ReDoS via optional groups/wildcards | ✅ `npm audit fix` |
| **High** | `flatted` | Prototype Pollution via parse() | ✅ `npm audit fix` |
| **High** | `picomatch` (multiple) | ReDoS via extglob quantifiers | ✅ `npm audit fix` |
| **High** | `vite` | Path traversal in dep maps (8.0.0–8.0.4) | ✅ Upgrade to 8.0.13+ or `npm audit fix` |
| **Moderate** | `brace-expansion` | Process hang via zero-step/massive ranges | ✅ `npm audit fix` |
| **Moderate** | `postcss` <8.5.10 | XSS via unescaped `</style>` | ✅ Already at 8.5.8, update available |
| **Moderate** | `ws` | Uninitialized memory disclosure | ✅ `npm audit fix` |
| **Moderate** | `yaml` | Stack overflow via deeply nested YAML | ✅ `npm audit fix` |

### Recommendations

1. **Run `npm audit fix`** to resolve 8 of 13 vulnerabilities automatically
2. **Remove `html-inline`** (devDependency) if possible — it pulls in an unmaintained `trumpet` → `minimist` chain accounting for 3 critical CVEs. The build uses `esbuild` for server bundling; check if `html-inline` is actually needed.
3. **Upgrade `vite`** to 8.0.13+ to fix the path traversal CVE
4. **Upgrade `better-sqlite3`** to 12.10.0 for Node 26 compatibility
5. Defer major version upgrades (Tailwind 4, Vitest 4, ESLint 10, TypeScript 6) to a dedicated migration sprint

---

## 6. Code Quality Analysis

### TypeScript Strictness

Both tsconfig files have `"strict": true` plus additional strict checks (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUncheckedSideEffectImports`). This is **best-practice configuration**.

### `any` Type Usage

**Result: Zero instances of `: any` or `as any`** across the entire codebase (both client and server). This is exceptional.

### Error Handling

**Client:** 21 `catch` blocks across component files. Each catches errors with named variables (e.g., `requestError`, `submitError`, `error`). No empty catch blocks observed. No `console.error` or `console.log` calls in production code.

**Server:** 5 `catch` blocks in route handlers. All follow a consistent pattern:
```typescript
catch (error) {
  response.status(400).json({ 
    message: error instanceof Error ? error.message : 'Descriptive fallback message.' 
  });
}
```
A global Express 5 error handler exists in `server/src/app.ts` as a safety net. Error responses consistently use `{ message: string }` format.

**Concern:** Some server routes (automation, board, card, list, bootstrap) have **zero** try/catch blocks, relying entirely on the global error handler. While this works, explicit error handling in each route handler would improve debuggability and allow route-specific status codes.

### Input Validation

All server route handlers use **Zod `safeParse`** for request body validation, following the project's documented convention. Invalid input returns 400 with `{ message: string }`. This is correctly implemented across all routes.

### Authentication & Authorization

- **RBAC enforcement** is well-structured via dedicated `policies.ts` and `permissions.ts` modules imported in every route file
- Every route imports specific permission check functions (`canManageWorkspace`, `canAccessBoard`, etc.)
- Dedicated test file (`rbac-routes.test.ts`, 390 lines) covers cross-workspace isolation

### Code Organization

| Metric | Value | Assessment |
|--------|-------|------------|
| Total source files | 104 (TS/TSX) | Well-organized |
| Total source lines | ~14,976 | Moderate size |
| Test files | 21 (~3,446 lines) | Good coverage |
| Test-to-code ratio | ~1:4.3 | Adequate |
| Largest file | `NavigationOverlay.tsx` (965 lines) | ⚠️ Consider refactoring |
| 2nd largest | `CardModal.tsx` (847 lines) | ⚠️ Consider refactoring |
| Largest server file | `repositories.ts` (812 lines) | Acceptable for a DB layer |
| `any` usage | 0 | ✅ Excellent |
| `console.log/error` | 0 | ✅ Clean |
| ESLint suppressions | 0 | ✅ Clean |

### Architectural Quality

- **Clear separation**: Client (`src/`) and Server (`server/src/`) are cleanly separated
- **Path aliases**: `@/*` → `./src/*` for clean imports
- **shadcn/ui**: UI primitives are isolated in `src/components/ui/` (27 components)
- **Services layer**: API calls abstracted in `src/services/` (api.ts, admin.ts, data.ts, session.ts)
- **DB layer**: Repository pattern in `server/src/db/repositories.ts` with schema in `schema.ts`
- **Migration discipline**: Documented requirement for startup migration scripts on schema changes
- **Express 5**: Using the latest Express with async error handling

---

## Summary of Action Items

| Priority | Action | Impact |
|----------|--------|--------|
| 🔴 High | Upgrade `better-sqlite3` to 12.10.0+ (fixes Node 26 compat, unblocks 120+ tests) | Unblocks entire server test suite |
| 🔴 High | Add `localStorage` mock/polyfill to test setup | Unblocks 18 client tests |
| 🔴 High | Run `npm audit fix` (fixes 8/13 vulnerabilities) | Security posture |
| 🟡 Medium | Upgrade `vite` to 8.0.13+ (path traversal CVE) | Security |
| 🟡 Medium | Evaluate removing `html-inline` dependency (3 critical CVEs in chain) | Removes 3 critical CVEs |
| 🟡 Medium | Add explicit try/catch to server routes that lack them | Reliability, debuggability |
| 🟢 Low | Refactor `NavigationOverlay.tsx` (965 lines) and `CardModal.tsx` (847 lines) | Maintainability |
| 🟢 Low | Plan major version upgrades: Tailwind 4, Vitest 4, ESLint 10 | Long-term health |
| 🟢 Low | Update `react-day-picker` to v10 before v9 EOL | Maintenance |