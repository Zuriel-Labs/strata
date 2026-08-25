import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Every browser journey intentionally exercises the same persistent SQLite
  // database. Run them serially so a security-sensitive session revocation or
  // membership mutation in one journey cannot invalidate another journey's
  // authenticated actor halfway through its assertions.
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: "sh -c 'rm -f server/data/e2e.sqlite && SEED_DATA=true STRATA_DB_FILE=server/data/e2e.sqlite STRATA_PORT=8788 STRATA_API_TARGET=http://127.0.0.1:8788 STRATA_AUTOMATION_RUNNER_INTERVAL_MS=1000 npx concurrently -k \"npm run server:dev\" \"vite --host 127.0.0.1 --port 4173 --strictPort\"'",
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
