import { expect, test } from '../../fixtures/test';
import type { Page } from '@playwright/test';
import { AUTH_FILES } from '../../utils/const';
import { enterMessage, selectDifferentModel, sendMessage } from '../../utils/chat';
import { configureCharacter, deleteCharacter } from '../../utils/character';
import { waitForToast } from '../../utils/utils';
import { LLM_MODELS } from '../../utils/llm-models';
import { nanoid } from 'nanoid';

/**
 * Creates a character with an initial message, returns its ID extracted from the editor URL.
 */
async function createCharacterWithInitialMessage(
  page: Page,
  name: string,
  initialMessage: string,
): Promise<string> {
  await page.goto('/characters');
  await page.waitForURL('/characters**');

  await page.getByRole('button', { name: 'Dialogpartner erstellen' }).click();
  await page.waitForURL('/characters/editor/**');

  await configureCharacter(page, { name, initialMessage });

  // Navigate back to character list to verify creation
  await page.goto('/characters');

  // Click on the card to open its editor and extract the character ID from the URL
  await page.getByText(name).first().click();
  await page.waitForURL('/characters/editor/**');

  const url = page.url();
  // URL shape: /characters/editor/[characterId]
  const [characterId] = url.split('/characters/editor/')[1]?.split('?') ?? [];
  if (!characterId) throw new Error(`Unexpected URL shape, could not extract characterId: ${url}`);
  return characterId;
}

test.describe('character chat UX', () => {
  const characterName = 'Test Charakter ' + nanoid(8);
  const initialMessage = 'Hallo! Ich bin ein Testcharakter. Wie kann ich helfen?';
  let characterId = '';

  test.use({ storageState: AUTH_FILES.teacher });

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage({ storageState: AUTH_FILES.teacher });
    characterId = await createCharacterWithInitialMessage(page, characterName, initialMessage);
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    if (!characterId) return;
    const page = await browser.newPage({ storageState: AUTH_FILES.teacher });

    try {
      // restore default text model
      await page.goto('/');
      await selectDifferentModel(page, LLM_MODELS.TEXT_MODEL_1);

      // delete character
      await page.goto('/characters');
      await page.waitForURL('/characters');
      await deleteCharacter(page, characterName);
      await waitForToast(page, 'Der Dialogpartner wurde erfolgreich gelöscht.');
    } finally {
      await page.close();
    }
  });

  test('character initial message is visible in conversation (new conversation and opened from history)', async ({
    page,
  }) => {
    await page.goto(`/characters/d/${characterId}`);
    await page.getByTestId('chat-input').waitFor();

    // The initial message is visible at the start
    await expect(page.getByLabel('assistant message 1')).toBeVisible();

    // Send a user message so the conversation is persisted
    await sendMessage(page, 'Wer bist du?');

    // After first message the URL updates to the specific conversation
    await expect(page).toHaveURL(/\/characters\/d\/.+\/.+/);
    const conversationUrl = page.url();

    // Navigate away
    await page.goto('/');

    // Come back to the same conversation
    await page.goto(conversationUrl);
    await page.getByTestId('chat-input').waitFor();

    // The character's initial message must still appear at position 1
    await expect(page.getByLabel('assistant message 1')).toBeVisible();
    await expect(page.getByLabel('assistant message 1')).toContainText(initialMessage);

    // And the user's message should also be present
    await expect(page.getByLabel('user message 1')).toBeVisible();
    await expect(page.getByLabel('user message 1')).toContainText('Wer bist du?');
  });

  test('switching LLM model in character chat does not clear conversation history and preserves prompt', async ({
    page,
  }) => {
    await page.goto(`/characters/d/${characterId}`);

    // Send first message
    await sendMessage(page, 'Schreibe "OK"');

    // Both initial message and conversation messages should be visible
    await expect(page.getByLabel('assistant message 1')).toBeVisible();
    await expect(page.getByLabel('assistant message 2')).toBeVisible();
    await expect(page.getByLabel('user message 1')).toBeVisible();

    // Enter prompt
    const prompt = 'Dieser Prompt soll beim Modellwechsel nicht verschwinden';
    await enterMessage(page, prompt);

    // Switch model to the secondary model
    await selectDifferentModel(page, LLM_MODELS.TEXT_MODEL_2);

    // Entered prompt should not be cleared
    await expect(page.getByTestId('chat-input')).toHaveValue(prompt);

    // All messages must still be visible after the model switch
    await expect(page.getByLabel('assistant message 1')).toBeVisible();
    await expect(page.getByLabel('user message 1')).toBeVisible();
    await expect(page.getByLabel('assistant message 2')).toBeVisible();
  });
});
