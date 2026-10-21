// Used only by `playwright merge-reports -c smart-report/merge.config.ts <blob dir>` in CI
// (see .github/workflows/e2e.yml) to combine the chat-bot, admin and api blob
// reports into one aggregated smart-reporter report/history/PR comment. Lives
// under apps/chat-bot so `@playwright/test` and `playwright-smart-reporter`
// resolve from its node_modules.
import { defineConfig } from '@playwright/test';

const config = defineConfig({
  reporter: [
    [
      'playwright-smart-reporter',
      {
        outputFile: 'smart-report.html',
        historyFile: 'test-history.json',
        maxHistoryRuns: 20,
        exportJson: true,
        accessibility: { enabled: true, standard: 'WCAG2AA' },
        baseline: { branch: 'target', filterHistory: true },
      },
    ],
  ],
});

export default config;
