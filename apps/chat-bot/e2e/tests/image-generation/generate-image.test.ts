import { expect, test } from '../../fixtures/test';
import { selectDifferentImageModel } from '../../utils/chat';
import { AUTH_FILES } from '../../utils/const';
import { LLM_MODELS } from '../../utils/llm-models';
import { waitForToast } from '../../utils/utils';

test.use({ storageState: AUTH_FILES.teacher });

test('can generate an image and use image actions', { tag: '@smoke' }, async ({ page }) => {
  // navigate to image generation
  await page.goto('/image-generation');
  await page.waitForURL('/image-generation**');

  await selectDifferentImageModel(page, LLM_MODELS.IMAGE_MODEL);

  // send message
  const prompt = 'A duck with a hat';
  await page.getByTestId('image-prompt-input').fill(prompt);
  await page.getByTestId('image-generate-button').click();

  // wait for image to appear, with better error handling
  const generatedImage = page.getByTestId('generated-image');
  const loadingAnimation = page.getByAltText('Ladeanimation');

  // Wait for loading to finish
  try {
    await loadingAnimation.waitFor({ state: 'detached', timeout: 20000 });
  } catch {
    // If loading doesn't detach, check if an error appeared
    const errorMessage = page.getByText('Ein Fehler ist aufgetreten');
    const hasError = await errorMessage.isVisible().catch(() => false);
    if (hasError) {
      throw new Error('Image generation failed: error message appeared');
    }
  }

  // Now expect the image to be visible
  await expect(generatedImage).toBeVisible({ timeout: 5000 });

  // test if the image is visible by checking
  // if it has a src attribute and if the width is greater than 0
  await expect(generatedImage).toHaveAttribute('src', /.+/);
  await expect(async () => {
    const naturalWidth = await generatedImage.evaluate((img: HTMLImageElement) => img.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  }).toPass();

  // click on copy and check the success toast
  await page.getByTestId('image-copy-button').click();
  await waitForToast(page, 'Bild in die Zwischenablage kopiert');

  // click on download and verify a file download is triggered
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('image-download-button').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^AIS\.chat-Bild-.+\.png$/);

  // click on copy prompt and check the success toast
  await page.getByTestId('image-copy-prompt-button').click();
  await waitForToast(page, 'Prompt in die Zwischenablage kopiert');
});
