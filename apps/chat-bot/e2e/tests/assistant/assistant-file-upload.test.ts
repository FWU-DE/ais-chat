import { expect, test } from '../../fixtures/test';
import { AUTH_FILES, MOCK_LLM_COMMANDS } from '../../utils/const';
import { sendMessage, uploadFile } from '../../utils/chat';

test.use({ storageState: AUTH_FILES.teacher });

test('should upload file and chat with assistant template (Schulorganisationsassistent)', async ({
  page,
}) => {
  await page.goto('/assistants?filter=all');
  await page.waitForURL('/assistants**');

  // Wait for the Schulorganisationsassistent template card and click the chat button
  const card = page
    .getByTestId('entity-card')
    .filter({ hasText: 'Schulorganisationsassistent' })
    .first();
  await expect(card).toBeVisible();
  await card.getByTestId('chat-button').click();

  // Wait for the assistant chat page to load
  await page.waitForURL('/assistants/d/**');
  await expect(page.getByRole('heading')).toContainText('Schulorganisationsassistent');

  // Upload a file
  await uploadFile(page, './e2e/fixtures/file-upload/Große Text Datei.txt');

  // Verify file upload was successful
  await expect(page.locator('form').getByRole('img').nth(1)).toBeVisible();

  // Wait for file indexing/retrieval to be available before sending message
  // This ensures file chunks are available in the RAG context when the system prompt is built
  await page.waitForTimeout(1000);

  // Send message about file contents
  await sendMessage(
    page,
    `${MOCK_LLM_COMMANDS.CALL_RETRIEVE_ENTIRE_FILE} Wie heißt die Hauptperson die in dieser Datei genannt wird?`,
  );

  // Verify the response contains expected content
  // Get the last assistant message instead of relying on a fixed message index
  const allAssistantMessages = page.locator('[aria-label^="assistant message"]');
  const lastAssistantMessage = allAssistantMessages.last();
  await expect(lastAssistantMessage).toBeVisible({ timeout: 10000 });
  // 'Napoleon Bonaparte' is written in the uploaded file, which the mock LLM retrieves via tool call.
  await expect(lastAssistantMessage).toContainText(/Napol[eé]on Bonaparte/i, { timeout: 10000 });
});
