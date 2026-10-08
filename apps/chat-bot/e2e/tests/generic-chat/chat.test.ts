import { expect, test } from '@playwright/test';
import path from 'path';
import { deleteChat, enterMessage, regenerateMessage, sendMessage } from '../../utils/chat';
import { AUTH_FILES } from '../../utils/const';

test.use({ storageState: AUTH_FILES.teacher });

test('should successfully regenerate a response', async ({ page }) => {
  await page.goto('/');
  await sendMessage(page, 'Schreibe "OK" und eine Zufallszahl von 0 bis 1.000.000');

  // Verify the response contains the expected content
  const assistantMessage = page.getByLabel('assistant message 1');
  await expect(assistantMessage).toBeVisible();
  await expect(assistantMessage).toContainText('OK');

  // regenerate last message
  await regenerateMessage(page);
  await expect(page.getByLabel('assistant message 1')).toContainText('OK');
});

test('should copy response to clipboard', async ({ page }) => {
  await page.goto('/');
  await sendMessage(page, 'Schreibe "OK"');

  const assistantMessage = page.getByLabel('assistant message 1');
  await expect(assistantMessage).toBeVisible();

  await assistantMessage.getByTestId('copy-to-clipboard').click();
  const text = await assistantMessage.innerText();
  const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardContent).toBe(text);
});

test('should successfully delete the current chat', async ({ page }) => {
  await page.goto('/');
  await sendMessage(page, 'Schreibe "OK"');
  await deleteChat(page, path.basename(page.url()));

  await page.waitForURL('/');

  expect(page.url()).not.toContain('/d/');
});

test('after receiving the first message the typed prompt is not lost', async ({ page }) => {
  await page.goto('/');

  await enterMessage(page, 'Schreibe "OK"');
  await page.keyboard.press('Enter');

  const prompt = 'Dieser Prompt soll nicht verschwinden';
  await enterMessage(page, prompt);
  await page.getByLabel('Reload').waitFor();

  await expect(page).toHaveURL(/\/d\//);
  await expect(page.getByTestId('chat-input')).toHaveValue(prompt);
});
