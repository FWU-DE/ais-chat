import fs from 'node:fs';
import { expect, test } from '../../fixtures/test';
import { AUTH_FILES, IMAGE_MODELS_FILE, LLM_MODELS_FILE } from '../../utils/const';
import { selectDifferentImageModel, selectDifferentModel, sendMessage } from '../../utils/chat';

test.use({ storageState: AUTH_FILES.teacher });
test.describe.configure({ mode: 'parallel' });

/**
 * Model display names are written to LLM_MODELS_FILE / IMAGE_MODELS_FILE by globalSetup.ts at
 * the start of every test run, so these lists always reflect what is in the database for the
 * E2E_FEDERAL_STATE environment.
 */
const llmModels: string[] = JSON.parse(fs.readFileSync(LLM_MODELS_FILE, 'utf-8'));
const imageModels: string[] = JSON.parse(fs.readFileSync(IMAGE_MODELS_FILE, 'utf-8'));

test.describe('text models', () => {
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
});

test.describe('image models', () => {
  imageModels.forEach((modelName) => {
    test(
      `${modelName} generates an image from a simple prompt`,
      { tag: '@external-services' },
      async ({ page }) => {
        await page.goto('/image-generation');
        await page.waitForURL('/image-generation**');
        await selectDifferentImageModel(page, modelName);

        await page.getByTestId('image-prompt-input').fill('A duck with a hat');
        await page.getByTestId('image-generate-button').click();

        const generatedImage = page.getByTestId('generated-image');
        const loadingAnimation = page.getByAltText('Ladeanimation');
        await loadingAnimation.waitFor({ state: 'detached', timeout: 60000 });

        await expect(generatedImage).toBeVisible({ timeout: 5000 });
        await expect(generatedImage).toHaveAttribute('src', /.+/);
        await expect(async () => {
          const naturalWidth = await generatedImage.evaluate(
            (img: HTMLImageElement) => img.naturalWidth,
          );
          expect(naturalWidth).toBeGreaterThan(0);
        }).toPass();
      },
    );
  });
});
