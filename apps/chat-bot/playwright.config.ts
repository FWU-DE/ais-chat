import { defineConfig, devices } from '@playwright/test';

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
  webServer: {
    command: 'pnpm dev',
    timeout: 60000, // wait 60 seconds for web server at url to be available
    url: 'http://localhost:3000', // the server to be used for tests
    reuseExistingServer: true,
    stdout: 'pipe',
  },
});
