// Used only by `playwright merge-reports -c smart-report/merge.config.ts <blob dir>` in CI
// (see .github/workflows/e2e.yml) to combine the chat-bot, admin and api blob
// reports into one aggregated smart-reporter report/history/PR comment. Lives
// under apps/chat-bot so `@playwright/test` and `playwright-smart-reporter`
// resolve from its node_modules.
import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const reportDir = fileURLToPath(new URL('.', import.meta.url));

const config = defineConfig({
  // Must match the chat-bot/admin/api playwright configs' testDir (the monorepo root), so
  // merged test locations rebase onto the same root they were originally recorded against
  // instead of nonexistent paths relative to this directory.
  testDir: '../../..',
  reporter: [
    [
      'playwright-smart-reporter',
      {
        // Absolute, since testDir above also sets this config's rootDir, which the reporter
        // otherwise uses as the output directory.
        outputFile: path.join(reportDir, 'smart-report.html'),
        historyFile: path.join(reportDir, 'test-history.json'),
        maxHistoryRuns: 20,
        exportJson: true,
        accessibility: { enabled: true, standard: 'WCAG2AA' },
        baseline: { branch: 'target', filterHistory: true },
      },
    ],
  ],
});

export default config;
