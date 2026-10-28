import fs from 'node:fs';
import { expect, test } from '../../fixtures/test';
import { AUTH_FILES, LLM_MODELS_FILE } from '../../utils/const';
import { selectDifferentModel, sendMessage } from '../../utils/chat';

test.use({ storageState: AUTH_FILES.teacher });
test.describe.configure({ mode: 'parallel' });

/**
 * Model display names are written to LLM_MODELS_FILE by globalSetup.ts at the
 * start of every test run, so this list always reflects what is in the database
 * for the E2E_FEDERAL_STATE environment.
 */
const llmModels: string[] = JSON.parse(fs.readFileSync(LLM_MODELS_FILE, 'utf-8'));

llmModels.forEach((modelName) => {
  test(
    `${modelName} responds to a simple prompt`,
    { tag: '@external-services' },
    async ({ page }) => {
      await page.goto('/');
      await selectDifferentModel(page, modelName);
      await sendMessage(page, 'Antworte mit genau dem Wort "OK".');
      await expect(page.getByLabel('assistant message 1')).toContainText(/ok/i);
    },
  );
});
