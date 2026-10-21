import { expect, test } from '../../fixtures/test';
import { AUTH_FILES } from '../../utils/const';
import { waitForToast } from '../../utils/utils';

test.use({ storageState: AUTH_FILES.teacher });

test('can generate an image and use image actions', async ({ page }) => {
  // navigate to image generation
  await page.goto('/image-generation');
  await page.waitForURL('/image-generation**');

  // get selected model
  const selectedModelLocator = page.getByTestId('main-menu-item-image-model-selected');
  const currentSelectedText = await selectedModelLocator.textContent();
  expect(currentSelectedText).toBeTruthy();

  // Assert that gpt-image model is selected
  if (!currentSelectedText?.includes('GPT-Image')) {
    const dropdownLocator = page.getByTestId('main-menu-item-image-model-dropdown');
    await dropdownLocator.waitFor();
    await dropdownLocator.click();
    await page.locator('div[data-radix-popper-content-wrapper]').waitFor();
    const modelLocator = page.getByTestId(/menu-item-gpt-image/i);
    await modelLocator.waitFor();
    await modelLocator.click();
  }

  // send message
  const prompt = 'A duck with a hat';
  await page.getByTestId('image-prompt-input').fill(prompt);
  await page.getByTestId('image-generate-button').click();

  // wait for image to appear, with better error handling
  const generatedImage = page.getByTestId('generated-image');
  const loadingAnimation = page.getByAltText('Ladeanimation');

  // Wait for loading to finish
  try {
    await loadingAnimation.waitFor({ state: 'detached', timeout: 60000 });
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
