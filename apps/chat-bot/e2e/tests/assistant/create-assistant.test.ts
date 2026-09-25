import { expect, test } from '@playwright/test';
import { AUTH_FILES, MOCK_LLM_COMMANDS } from '../../utils/const';
import { waitForAutosave, waitForToast } from '../../utils/utils';
import { sendMessage } from '../../utils/chat';
import { configureAssistant, createAssistant, deleteAssistant } from '../../utils/assistant';
import { nanoid } from 'nanoid';

test.use({ storageState: AUTH_FILES.teacher });

test('teacher can login, create an assistant and start a chat', async ({ page }) => {
  const assistantName = 'Hausbauplaner ' + nanoid(8);

  await page.goto('/assistants');
  await page.waitForURL('/assistants');

  const createButton = page.getByRole('button', { name: 'Assistent erstellen' });
  await expect(createButton).toBeVisible();
  await createButton.click();

  await page.waitForURL('/assistants/editor/**');

  // configure form
  await configureAssistant(page, {
    name: assistantName,
    promptSuggestions: [
      'Was kostet ein Grundstück in München?',
      'Dieser Promptvorschlag wird wieder gelöscht.',
      'Was ist das aktuelle Zinsniveau',
      'Wo kann man günstig Baugrund erwerben',
    ],
  });

  // delete one suggestion again
  await page.getByTestId('delete-prompt-suggestion-2-button').click();

  // save form
  await waitForAutosave(page);
  await page.goto('/assistants');

  const card = page.getByTestId('entity-card').filter({ hasText: assistantName }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByTestId('chat-button').click();
  await page.waitForURL('/assistants/d/**');
  await expect(page.getByRole('heading')).toContainText(assistantName);
  await expect(page.locator('body')).toContainText(
    'Hilft bei der Planung und Budget Rechnung beim Bau eines Einfamilienhauses',
  );
  await expect(page.locator('body')).toContainText('Was kostet ein Grundstück in München?');
  await expect(page.locator('body')).toContainText('Was ist das aktuelle Zinsniveau');
  await expect(page.locator('body')).toContainText('Wo kann man günstig Baugrund erwerben');
  await sendMessage(
    page,
    `${MOCK_LLM_COMMANDS.RETURN_SYSTEM_PROMPT} Gib deinen vollständigen Namen aus`,
  );

  // assistantName is included in the assistant's system prompt;
  // the mock LLM echoes the system prompt back.
  await expect(page.getByLabel('assistant message 1')).toContainText(assistantName);

  await page.reload();
  await page.waitForURL('/assistants/d/**/**');
  await expect(page.getByLabel('assistant message 1')).toContainText(assistantName);
});

test('teacher can delete assistant with chat', async ({ page }) => {
  const assistantName = 'Hausbauplaner ' + nanoid(8);
  await createAssistant(page);
  await configureAssistant(page, { name: assistantName });

  await page.goto('/assistants');
  const card = page.getByTestId('entity-card').filter({ hasText: assistantName }).first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByTestId('chat-button').click();
  await page.waitForURL('/assistants/d/**');

  await page.goto('/assistants');
  await page.waitForURL('/assistants');

  await deleteAssistant(page, assistantName);

  await waitForToast(page, 'Der Assistent wurde erfolgreich gelöscht.');
  await page.waitForURL('/assistants**');
  await expect(page.getByRole('heading', { name: assistantName }).first()).not.toBeVisible();
});

test('data is autosaved on blur', async ({ page }) => {
  await page.goto('/assistants');
  await page.waitForURL('/assistants');

  const createButton = page.getByRole('button', { name: 'Assistent erstellen' });
  await expect(createButton).toBeVisible();
  await createButton.click();

  await page.waitForURL('/assistants/editor/**');

  const autosaveAssistantName = 'Autosave Test GPT ' + nanoid(8);

  // Fill out the form
  await configureAssistant(page, {
    name: autosaveAssistantName,
    description: 'Test description for autosave validation',
    instructions: 'Test functions for autosave validation',
    promptSuggestions: ['Test prompt suggestion'],
  });

  // Navigate to assistant overview explicitly to check if data was saved correctly
  await page.goto('/assistants');
  const autosaveCard = page
    .getByTestId('entity-card')
    .filter({ hasText: autosaveAssistantName })
    .first();
  await expect(autosaveCard).toBeVisible({ timeout: 15000 });
  await autosaveCard.getByTestId('entity-link').click();
  await page.waitForURL('/assistants/editor/**');

  // change title to new value
  await page.getByTestId('assistant-name-input').fill('');
  await page.getByTestId('assistant-name-input').fill('New Title');
  await page.getByTestId('assistant-name-input').press('Tab');
  await waitForAutosave(page);
  await page.reload();
  await expect(page.getByTestId('assistant-name-input')).toHaveValue('New Title');

  // change description to new value
  const descriptionInput = page.getByTestId('assistant-description-input');
  await descriptionInput.fill('');
  await descriptionInput.fill('New Description');
  await descriptionInput.press('Tab');
  await waitForAutosave(page);
  await page.reload();
  await expect(page.getByTestId('assistant-description-input')).toHaveValue('New Description');

  // change instructions to new value
  const instructionsInput = page.getByTestId('assistant-instructions-input');
  await instructionsInput.fill('');
  await instructionsInput.fill('New Instructions');
  await instructionsInput.press('Tab');
  await waitForAutosave(page);
  await page.reload();
  await expect(page.getByTestId('assistant-instructions-input')).toHaveValue('New Instructions');

  // change prompt suggestion to new value
  const promptSuggestionInput = page.getByTestId('prompt-suggestion-1-input');
  await promptSuggestionInput.fill('');
  await promptSuggestionInput.fill('New Prompt Suggestion');
  await promptSuggestionInput.press('Tab');
  await waitForAutosave(page);
  await page.reload();
  await expect(page.getByTestId('prompt-suggestion-1-input')).toHaveValue('New Prompt Suggestion');
});
