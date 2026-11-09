import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as dotenvConfig } from '@dotenvx/dotenvx';
import { defineConfig, devices } from '@playwright/test';

// PORT comes from the same env files the admin dev server loads (.env.local overrides .env.development).
const appDir = path.dirname(fileURLToPath(import.meta.url));
const env: Record<string, string> = {};
dotenvConfig({
  path: ['.env.local', '.env.development'].map((file) => path.join(appDir, file)),
  processEnv: env,
  quiet: true,
  ignore: ['MISSING_ENV_FILE'],
});
const port = env.PORT;
if (!port) throw new Error('PORT is not set in apps/admin/.env.development or .env.local');
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  // The monorepo root, shared with the chat-bot/api configs, so merged smart-reporter
  // test locations resolve correctly across apps (see ../chat-bot/smart-report/merge.config.ts).
  // The project below restores this app's own e2e/tests dir for test discovery.
  testDir: '../..',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: './playwright-report' }],
    ['list'],
    // For smart-reporter (see ../chat-bot/smart-report/merge.config.ts)
    ['blob', { outputDir: 'blob-report', fileName: 'admin-report.zip' }],
  ],
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', testDir: './e2e/tests', use: devices['Desktop Chrome'] }],
  webServer: {
    command: 'pnpm dev',
    timeout: 60_000,
    url: `${baseURL}/api/healthz`,
    reuseExistingServer: true,
    stdout: 'pipe',
  },
});
