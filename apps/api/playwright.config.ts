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
  // The monorepo root, shared with the chat-bot/admin configs, so merged smart-reporter
  // test locations resolve correctly across apps (see ../chat-bot/smart-report/merge.config.ts).
  // The project below restores this app's own e2e/tests dir for test discovery.
  testDir: '../..',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : 1,
  reporter: [
    ['html', { outputFolder: './playwright-report' }],
    ['list'],
    // For smart-reporter (see ../chat-bot/smart-report/merge.config.ts)
    ['blob', { outputDir: 'blob-report', fileName: 'api-report.zip' }],
  ],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${process.env.PORT ?? '3002'}`,
  },
  projects: [
    {
      name: 'api',
      testDir: './e2e/tests/',
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
