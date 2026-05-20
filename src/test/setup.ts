import '@testing-library/jest-dom/vitest';

// Disable CSRF enforcement and rate limiting for all test suites by default.
// The dedicated test files (csrf.test.ts, rate-limit.test.ts) explicitly
// re-enable these to test enforcement behavior.
process.env.STRATA_CSRF_DISABLED = 'true';
process.env.STRATA_RATE_LIMIT_DISABLED = 'true';

beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});