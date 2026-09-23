import { defineConfig } from '@playwright/test';
import { config as dotenvConfig } from '@dotenvx/dotenvx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.test for e2e tests.
// This file should define any environment variables needed by the Playwright tests,
// e.g. a test API key in sk_ format used for client auth.
// The API server itself loads .env.local via its own load-env.ts.
dotenvConfig({ path: path.resolve(__dirname, '.env.test') });

export default defineConfig({
  testDir: './e2e/tests/',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : 1,
  reporter: [['html', { outputFolder: './playwright-report' }], ['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${process.env.PORT ?? '3002'}`,
  },
  projects: [
    {
      name: 'api',
      testMatch: /.*\.api\.test\.ts/,
    },
  ],
  webServer: {
    command: 'pnpm dev',
    timeout: 30_000,
    url: 'http://localhost:3002/health',
    reuseExistingServer: true,
    stdout: 'pipe',
  },
});
