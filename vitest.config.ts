import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Provide deterministic seed passwords for tests so test fixtures
// continue to work without hardcoding credentials in source code.
process.env.ADMIN_INITIAL_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || 'ChangeMe123!';
process.env.SEED_ALEX_PASSWORD = process.env.SEED_ALEX_PASSWORD || 'WorkspaceAdmin123!';
process.env.SEED_PRIYA_PASSWORD = process.env.SEED_PRIYA_PASSWORD || 'Member12345!';
process.env.SEED_MARCUS_PASSWORD = process.env.SEED_MARCUS_PASSWORD || 'BoardAdmin123!';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
      exclude: ['src/components/ui/**', 'src/main.tsx', 'server/src/index.ts'],
    },
  },
});
