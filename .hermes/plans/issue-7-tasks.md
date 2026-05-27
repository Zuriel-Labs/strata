# Tasks: Issue #7 — Security: Reduce attack surface

1. **Add CORS dependency**
   - Acceptance: `npm install cors` and `@types/cors` run successfully; `package-lock.json` updated
   - Effort: XS

2. **Reduce body size limits**
   - Acceptance: `app.ts` uses `'1mb'` instead of `'12mb'`; auth routes enforce `'100kb'`
   - Effort: S

3. **Add CORS middleware**
   - Acceptance: `app.ts` imports `cors`, `app.use(cors(...))` present with origin env var logic; no compile error
   - Effort: S

4. **Dockerfile builder stage slim**
   - Acceptance: Builder `FROM` line uses `node:22-bookworm-slim`; `apt-get install -y python3 make g++` present in builder stage only; runtime stage unchanged
   - Effort: XS

5. **Remove hardcoded seed passwords**
   - Acceptance: `bootstrap.ts` has zero occurrences of `ChangeMe123!` or `WorkspaceAdmin123!`; passwords come from env vars or `randomBytes(16).toString('base64')`; generated passwords logged to stdout
   - Effort: S

6. **Type safety**
   - Acceptance: `typecheck` passes; if env types file exists, new env vars are declared
   - Effort: XS

7. **Quality gates**
   - Acceptance: `npm run lint` and `npm run typecheck` and `npm run test` all pass
   - Effort: S
