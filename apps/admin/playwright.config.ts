import { defineConfig, devices } from '@playwright/test';

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
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', testDir: './e2e/tests', use: devices['Desktop Chrome'] }],
  webServer: {
    command: 'pnpm dev',
    timeout: 60_000,
    url: 'http://localhost:3001/api/healthz',
    reuseExistingServer: true,
    stdout: 'pipe',
  },
});
