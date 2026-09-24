import path from 'node:path';
import { expect, Page, test } from '@playwright/test';
import { waitForToast } from './utils';

export async function regenerateMessage(page: Page) {
  await page.getByLabel('Reload').click();
  await page.getByLabel('Reload').waitFor({ state: 'hidden' });
  await page.getByLabel('Reload').waitFor();
}

export async function enterMessage(page: Page, message: string) {
  await page.getByTestId('chat-input').waitFor();
  await page.getByTestId('chat-input').fill(message);
}

export async function sendMessage(
  page: Page,
  message: string,
  options: { expectedError?: string } = {},
) {
  await test.step('send message and wait for response', async () => {
    const loadingSpinner = page.getByAltText('Ladeanimation');
    const errorBox = page.getByRole('button', { name: 'Erneut versuchen' });

    await enterMessage(page, message);
    const waitForLoadingSpinner = loadingSpinner.waitFor();
    await page.keyboard.press('Enter');
    // Wait for the loading spinner to appear after sending the message
    await waitForLoadingSpinner;

    if (options.expectedError !== undefined) {
      await errorBox.waitFor({ timeout: 20_000 });
      await expect(page.getByText(options.expectedError, { exact: true })).toBeVisible();
      return;
    }

    // Either the response finishes successfully and shows the Reload button,
    // or an error message appears and the test should fail.
    await Promise.race([
      loadingSpinner.waitFor({ state: 'detached', timeout: 80_000 }),
      errorBox.waitFor({ timeout: 80_000 }).then(() => {
        throw new Error('Error message appeared after sending message');
      }),
    ]);
  });
}

export async function uploadFile(page: Page, filePath: string) {
  const fileInput = page.locator('input[type="file"]');

  const uploadPromise = page.waitForResponse('/api/v1/files');
  await fileInput.setInputFiles(filePath);

  // Wait for the upload to complete
  const result = await uploadPromise;
  const filename = path.basename(filePath);
  expect(result.status(), `File upload failed for ${filename}`).toBe(200);

  // Wait for the loading spinner to disappear
  await page.locator('form svg.animate-spin').waitFor({ state: 'detached' });
}

/** Opens the LLM model dropdown and selects a specific model by displayName, or the first available alternative if no name is provided. */
export async function selectDifferentModel(page: Page, modelName?: string) {
  const dropdown = page.getByTestId('main-menu-item-model-dropdown');
  await expect(dropdown).toBeVisible();

  const isDisabled = await dropdown.evaluate((el) => (el as HTMLButtonElement).disabled);
  if (isDisabled) return;

  const selectedModel = await dropdown.innerText();
  if (modelName && selectedModel === modelName) {
    // requested model is already selected
    return;
  }

  await dropdown.click();

  if (modelName) {
    const option = page.getByTestId(`menu-item-${modelName}`);
    const modelUpdate = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/user/model') && response.request().method() === 'POST',
    );
    await option.click();
    const response = await modelUpdate;
    expect(response.ok(), `Failed to persist selected model ${modelName}`).toBe(true);
  } else {
    // The selected model is not listed in the dropdown
    // -> selecting the first menu item will be a different model
    const firstOption = page.getByRole('menuitem').first();
    await firstOption.click();
  }
}

/**
 * This function does not work reliably in firefox, likely due to a known issue with
 * Playwright and firefox where hover actions are not properly registered.
 */
export async function deleteChat(page: Page, conversationId: string) {
  const listItem = page.locator(`li:has(a[href="/d/${conversationId}"])`).first();

  // Refresh the sidebar before looking up the virtualized item. The chat page can finish
  // rendering before the query invalidation triggered by the first response completes.
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // The sidebar is virtualized and may still be refreshing after the page reload.
  await expect(listItem).toBeVisible({ timeout: 30_000 });
  await listItem.scrollIntoViewIfNeeded();

  const dropDownMenu = listItem.getByTestId('conversation-actions');
  // Clicking the hidden trigger directly avoids Firefox's unreliable hover handling.
  await dropDownMenu.click({ force: true });

  await page.getByTestId('delete-conversation').click();
  await waitForToast(page);
}
