import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: "sh -c 'rm -f server/data/e2e.sqlite && SEED_DATA=true STRATA_DB_FILE=server/data/e2e.sqlite npx concurrently -k \"npm run server:dev\" \"vite --host 127.0.0.1 --port 4173\"'",
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
