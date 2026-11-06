import path from 'node:path';

import { expect, Page, test } from '@playwright/test';

import type { AiActivityStep, AiActivityToolName } from '@/types/ai-activity';

import { waitForToast } from './utils';

type AiActivityStepId = AiActivityToolName | Exclude<AiActivityStep['kind'], 'tool'>;

export async function regenerateMessage(page: Page) {
  await page.getByTestId('regenerate-message-button').click();
  await page.getByTestId('regenerate-message-button').waitFor({ state: 'hidden' });
  await page.getByTestId('regenerate-message-button').waitFor();
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
    const errorBox = page.getByRole('button', { name: 'Erneut versuchen' });
    const assistantMessages = page.getByLabel(/^assistant message /);
    const assistantMessage = assistantMessages.nth(await assistantMessages.count());

    await enterMessage(page, message);
    await page.keyboard.press('Enter');

    await assistantMessage.or(errorBox).first().waitFor({ timeout: 80_000 });
    if (await errorBox.isVisible()) {
      if (options.expectedError === undefined) {
        throw new Error('Error message appeared after sending message');
      }

      await expect(page.getByText(options.expectedError, { exact: true })).toBeVisible();
      return;
    }

    if (options.expectedError !== undefined) {
      await errorBox.waitFor({ timeout: 20_000 });
      await expect(page.getByText(options.expectedError, { exact: true })).toBeVisible();
      return;
    }

    // Either the response finishes successfully and shows the Reload button,
    // or an error message appears and the test should fail.
    await assistantMessage
      .getByTestId('regenerate-message-button')
      .or(errorBox)
      .first()
      .waitFor({ timeout: 80_000 });
    if (await errorBox.isVisible()) {
      throw new Error('Error message appeared after sending message');
    }
  });
}

export async function uploadFile(page: Page, filePath: string) {
  const fileInput = page.locator('input[type="file"]');

  const uploadPromise = page.waitForResponse('/api/v1/files', { timeout: 15_000 });
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
  const dropdown = page.getByTestId('main-menu-item-text-model-dropdown');
  await expect(dropdown).toBeVisible();

  const isDisabled = await dropdown.evaluate((el) => (el as HTMLButtonElement).disabled);
  if (isDisabled) return;

  const selectedModel = await page.getByTestId('main-menu-item-text-model-selected').innerText();
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

/** Opens the image model dropdown and selects a specific model by displayName, or the first available alternative if no name is provided. */
export async function selectDifferentImageModel(page: Page, modelName?: string) {
  const selectedModel = await page.getByTestId('main-menu-item-image-model-selected').innerText();
  if (modelName && selectedModel === modelName) {
    // requested model is already selected
    return;
  }

  // When there's only one image model, the dropdown isn't rendered at all (nothing to switch to)
  const dropdown = page.getByTestId('main-menu-item-image-model-dropdown');
  await expect(dropdown).toBeVisible();

  const isDisabled = await dropdown.evaluate((el) => (el as HTMLButtonElement).disabled);
  if (isDisabled) return;

  await dropdown.click();

  if (modelName) {
    const option = page.getByTestId(`menu-item-${modelName}`);
    await option.click();
  } else {
    // The selected model is not listed in the dropdown
    // -> selecting the first menu item will be a different model
    const firstOption = page.getByRole('menuitem').first();
    await firstOption.click();
  }
}

/**
 * Opens the AI activity panel on the given assistant message (last one by default, if needed)
 * and asserts that the given step is listed.
 */
export function expectAiActivityStep(page: Page, stepId: AiActivityStepId, messageIndex?: number) {
  return test.step('expect AI activity step visibility', async () => {
    const aiActivityToggles =
      messageIndex !== undefined
        ? page.getByTestId(`ai-activity-toggle-${messageIndex}`)
        : page.getByTestId(/^ai-activity-toggle-/);
    const aiActivityToggle = aiActivityToggles.last();

    await expect(aiActivityToggle).toBeVisible();

    if ((await aiActivityToggle.getAttribute('aria-expanded')) === 'false') {
      await aiActivityToggle.click();
    }

    const panelContentId = await aiActivityToggle.getAttribute('aria-controls');
    const panelContent = panelContentId ? page.locator(`#${panelContentId}`) : page;
    const step = panelContent.getByTestId(`ai-activity-step-${stepId}`);
    await expect(step.first()).toBeVisible();
  });
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
