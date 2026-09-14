import { expect, test } from '@playwright/test';
import { AUTH_FILES } from '../../utils/const';

test.use({ storageState: AUTH_FILES.teacher });

test('can edit an image by uploading a reference image and providing a prompt', async ({
  page,
}) => {
  test.setTimeout(180000);

  // Navigate to image generation
  await page.goto('/image-generation');
  await page.waitForURL('/image-generation**');

  // Ensure the GPT-Image model (which supports image inputs) is selected
  const selectedModelLocator = page.getByTestId('main-menu-item-image-model-selected');
  const currentSelectedText = await selectedModelLocator.textContent();
  expect(currentSelectedText).toBeTruthy();

  if (!currentSelectedText?.includes('GPT-Image')) {
    const dropdownLocator = page.getByTestId('main-menu-item-image-model-dropdown');
    await dropdownLocator.waitFor();
    await dropdownLocator.click();
    await page.locator('div[data-radix-popper-content-wrapper]').waitFor();
    const modelLocator = page.getByTestId(/menu-item-gpt-image/i);
    await modelLocator.waitFor();
    await modelLocator.click();
  }

  // Upload the reference image via the image-generation-specific upload button
  const uploadButton = page.getByTestId('image-generation-upload-button');
  await expect(uploadButton).toBeVisible();

  const fileInput = page.locator('input[type="file"]');
  const uploadPromise = page.waitForResponse('/api/v1/files');
  await fileInput.setInputFiles('./e2e/fixtures/file-upload/sample.jpg');
  const uploadResult = await uploadPromise;
  expect(uploadResult.status(), 'File upload failed for sample.jpg').toBe(200);

  // Attachment preview should now be visible above the submit button
  await expect(page.getByAltText('sample.jpg')).toBeVisible();

  // Send the edit prompt
  const prompt = 'Make this image cyberpunk';
  await page.getByTestId('image-prompt-input').fill(prompt);
  await page.getByTestId('image-generate-button').click();

  await expect(page.getByText('Verwendete Anhänge')).toBeVisible();

  const loadingAnimation = page.getByAltText('Ladeanimation');

  try {
    await loadingAnimation.waitFor({ state: 'detached', timeout: 60000 });
  } catch {
    const errorMessage = page.getByText('Ein Fehler ist aufgetreten');
    const hasError = await errorMessage.isVisible().catch(() => false);
    if (hasError) {
      throw new Error('Image editing failed: error message appeared');
    }
  }

  // Verify the generated image is displayed
  const generatedImage = page.getByTestId('generated-image');
  await expect(generatedImage).toBeVisible({ timeout: 5000 });
  await expect(generatedImage).toHaveAttribute('src', /.+/);
  await expect(async () => {
    const naturalWidth = await generatedImage.evaluate((img: HTMLImageElement) => img.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  }).toPass();

  await expect(page.getByText('Verwendete Anhänge')).toBeVisible();

  await page.getByTestId('image-prompt-input').fill('Make the generated image brighter');
  await page.getByTestId('image-generate-button').click();

  try {
    await loadingAnimation.waitFor({ state: 'detached', timeout: 90000 });
  } catch {
    const errorMessage = page.getByText('Ein Fehler ist aufgetreten');
    if (await errorMessage.isVisible().catch(() => false)) {
      throw new Error('Second image edit failed: error message appeared');
    }
    throw new Error('Second image edit did not finish within 90 seconds');
  }
  await expect(page.getByTestId('image-version-select')).toBeVisible();

  await page.getByTestId('image-version-select').click();
  await expect(page.getByTestId('image-version-option-0')).toBeVisible();
  await expect(page.getByTestId('image-version-option-1')).toBeVisible();
  await page.getByTestId('image-version-option-0').click();
  await expect(generatedImage).toBeVisible();
});
