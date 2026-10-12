import { parse as parseEnvFile } from '@dotenvx/dotenvx';
import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const chatBotAppDir = fileURLToPath(new URL('.', import.meta.url));
const adminAppDir = fileURLToPath(new URL('../admin', import.meta.url));

/**
 * Loads an app's own .env.development (committed) and .env.local (gitignored,
 * optional) in isolation. Used to give each webServer its own app's env
 * instead of leaking whichever app's dotenvx-injected env the top-level
 * `playwright test` process happened to be started with (e.g. running
 * chat-bot's `e2e:ui`, which injects chat-bot's .env.local, would otherwise
 * also leak into the admin webServer and shadow admin-specific values like
 * NEXTAUTH_URL or AUTH_SECRET).
 */
function loadAppEnv(appDir: string): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const file of ['.env.development', '.env.local']) {
    const filePath = path.join(appDir, file);
    if (!existsSync(filePath)) continue;
    Object.assign(merged, parseEnvFile(readFileSync(filePath, 'utf8'), { processEnv: {} }));
  }
  return merged;
}

function withAppEnv(appDir: string): Record<string, string> {
  const baseEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  return { ...baseEnv, ...loadAppEnv(appDir) };
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  globalSetup: './e2e/global-setup',
  testDir: './e2e/tests/',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : 1,
  // Limit the number of failures on CI to save resources
  maxFailures: process.env.CI ? 10 : undefined,
  reporter: [
    ['html', { outputFolder: './playwright-report' }],
    ['json'],
    ['github'],
    ['list'],
    ['./e2e/reporters/app-log-reporter.ts'],
  ],
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'retain-on-failure',
  },
  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      testIgnore: ['**/isolated/**', '**/external-services/**', /.*api.test.ts/],
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
    {
      name: 'firefox',
      testIgnore: ['**/isolated/**', '**/external-services/**', /.*api.test.ts/],
      use: {
        ...devices['Desktop Firefox'],
        // Firefox can be flaky in CI, so we slow it down and increase timeouts to improve stability
        launchOptions: {
          slowMo: 100,
        },
      },
    },
    {
      name: 'api test',
      testMatch: /.*api.test.ts/,
      fullyParallel: true,
    },
    {
      name: 'external-services',
      testMatch: '**/external-services/**/*.test.ts',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
    {
      name: 'isolated',
      testMatch: '**/isolated/**/*.test.ts',
      dependencies: ['chromium', 'firefox', 'api test'],
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],
  webServer: [
    {
      command: 'pnpm dev',
      timeout: 60000, // wait 60 seconds for web server at url to be available
      url: 'http://localhost:3000', // the server to be used for tests
      reuseExistingServer: true,
      stdout: 'pipe',
      name: 'chat-bot',
      env: withAppEnv(chatBotAppDir),
    },
    {
      // Admin app is required for cross-app tests (e.g. community templates).
      // Run from the admin directory with its own env so it doesn't inherit
      // chat-bot's env when this config is started via chat-bot's dotenvx scripts.
      command: 'pnpm dev',
      cwd: adminAppDir,
      timeout: 60000,
      url: 'http://localhost:3001',
      reuseExistingServer: true,
      stdout: 'pipe',
      name: 'admin',
      env: withAppEnv(adminAppDir),
    },
  ],
});
