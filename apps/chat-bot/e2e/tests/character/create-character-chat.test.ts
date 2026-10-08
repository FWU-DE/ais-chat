import { expect, test } from '@playwright/test';
import { nanoid } from 'nanoid';
import {
  configureCharacter,
  createCharacter,
  deleteCharacter,
  deleteCharacterFromDetailPage,
} from '../../utils/character';
import { regenerateMessage, sendMessage } from '../../utils/chat';
import { AUTH_FILES, MOCK_LLM_COMMANDS } from '../../utils/const';
import { stopShare, waitForAutosave, waitForToast, waitForToastDisappear } from '../../utils/utils';

test.use({ storageState: AUTH_FILES.teacher });

test.describe('create, share, chat, delete', () => {
  const characterName = 'John Cena ' + nanoid(8);

  test(
    'teacher can login, create and join shared dialogpartner chat',
    { tag: '@smoke' },
    async ({ page }) => {
      await page.goto('/characters');
      await page.waitForURL('/characters**');

      const createButton = page.getByRole('button', { name: 'Dialogpartner erstellen' });
      await expect(createButton).toBeVisible();
      await createButton.click();

      await page.waitForURL('/characters/editor/**');

      // configure form
      await configureCharacter(page, {
        name: characterName,
        description: `Er ist bekannt für seinen Spruch „You can't see me“ und seine Wrestling-Karriere.`,
        instructions: 'John Cena soll über seine Karriere und Erfolge sprechen.',
      });

      await page.goto('/characters');

      // check if created with the correct name
      const chatName = page.getByText(characterName).first();
      await expect(chatName).toBeVisible();
      await chatName.click();

      await page.waitForURL('/characters/editor/**');

      // test share page
      await page.getByTestId('token-points-select').click();
      await page.getByTestId('token-points-option-50').click();
      await page.getByTestId('usage-time-select').click();
      await page.getByTestId('usage-time-option-45').click();
      await page.getByTestId('start-share-button').click();

      await page.waitForURL('/characters/editor/**/share');
      const code = await page.getByTestId('join-code').textContent();

      const countDown = page.getByTestId('countdown-timer');
      await expect(countDown).toBeVisible();

      const qrCode = page.getByTestId('qr-code');
      await expect(qrCode).toBeVisible();

      // verify countdown is also shown on the overview list
      await page.goto('/characters');
      await page.waitForURL('/characters**');
      const card = page.getByTestId('entity-card').filter({ hasText: characterName }).first();
      await expect(card).toBeVisible();
      await expect(card.getByRole('timer')).toBeVisible();

      // join chat as teacher
      await page.goto('/logout');
      await page.waitForURL('/login');

      await page.locator('#login-invite-code').fill(code ?? '');

      const loginButton = page.getByRole('button', { name: 'Zum Dialog' });
      await expect(loginButton).toBeVisible();
      await loginButton.click();

      await page.waitForURL('/ua/characters/**/dialog?inviteCode=*');

      // send first message
      await sendMessage(page, `${MOCK_LLM_COMMANDS.RETURN_SYSTEM_PROMPT} Wer bist du?`);
      // The character's initial message precedes the response, so target the latest one.
      const assistantResponse = page.getByLabel(/^assistant message /).last();
      await assistantResponse.getByTestId('copy-to-clipboard').click();

      // 'John Cena' is the character name and is included in the system prompt;
      // the mock LLM echoes the system prompt back.
      await expect(assistantResponse).toContainText('John Cena');

      // regenerate last message
      await regenerateMessage(page);
      await expect(assistantResponse).toContainText('John Cena');
    },
  );

  test('teacher can delete character', async ({ page }) => {
    await page.goto('/characters');
    await page.waitForURL('/characters');

    await deleteCharacter(page, characterName);

    await waitForToast(page, 'Der Dialogpartner wurde erfolgreich gelöscht.');
    await expect(page.getByRole('heading', { name: characterName }).first()).not.toBeVisible();
  });

  test('teacher sees maximum token volume preselected after stopping share', async ({ page }) => {
    const maxCharacterName = 'Max Token Character ' + nanoid(8);

    await createCharacter(page);

    await configureCharacter(page, {
      name: maxCharacterName,
      description: 'Test character for maximum token preselection after unsharing.',
      instructions: 'Respond in short answers.',
    });

    // set share with learners limit params
    await page.getByTestId('token-points-select').click();
    await page.getByTestId('token-points-option-max').click();
    await page.getByTestId('usage-time-select').click();
    await page.getByTestId('usage-time-option-45').click();
    const editorUrl = page.url();
    await page.getByTestId('start-share-button').click();

    // verify share page
    await page.waitForURL('/characters/editor/**/share');
    await expect(page.getByTestId('countdown-timer')).toBeVisible();

    // stop share
    await page.goto(editorUrl);
    await page.waitForURL('/characters/editor/**');
    await stopShare(page);
    await expect(page.getByTestId('start-share-button')).toBeVisible();

    // verify maximum token points is preselected after stopping share
    await page.getByTestId('token-points-select').click();
    await expect(page.getByTestId('token-points-option-max')).toHaveAttribute(
      'data-state',
      'checked',
    );

    // Close the select popover so it cannot intercept clicks on the delete button
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('token-points-option-max')).not.toBeVisible();

    // cleanup
    await deleteCharacterFromDetailPage(page);
    await waitForToast(page, 'Der Dialogpartner wurde erfolgreich gelöscht.');
  });
});

test('data is autosaved on blur', async ({ page }) => {
  await createCharacter(page);

  const name = 'Autosave Test Character ' + nanoid(8);
  await configureCharacter(page, {
    name,
    description: 'Test description for autosave validation',
    instructions: 'Test instructions for autosave validation',
    initialMessage: 'Test initial message for autosave validation',
  });

  // Navigate back to list and open for editing
  await page.goto('/characters');
  await page.waitForURL('/characters');
  const listItem = page.getByTestId('entity-card').filter({ hasText: name }).first();
  await expect(listItem).toBeVisible();
  await listItem.getByTestId('entity-link').click();
  await page.waitForURL('/characters/editor/**');
  await waitForToastDisappear(page);

  // Name
  await page.getByTestId('character-name-input').fill('');
  await page.getByTestId('character-name-input').fill('New Name');
  await page.getByTestId('character-name-input').press('Tab');
  await waitForAutosave(page);
  await page.reload();
  await expect(page.getByTestId('character-name-input')).toHaveValue('New Name');

  // Description
  await page.getByTestId('character-description-input').fill('');
  await page.getByTestId('character-description-input').fill('New Description');
  await page.getByTestId('character-description-input').press('Tab');
  await waitForAutosave(page);
  await page.reload();
  await expect(page.getByTestId('character-description-input')).toHaveValue('New Description');

  // Instructions
  await page.getByTestId('character-instructions-input').fill('');
  await page.getByTestId('character-instructions-input').fill('New Instructions');
  await page.getByTestId('character-instructions-input').press('Tab');
  await waitForAutosave(page);
  await page.reload();
  await expect(page.getByTestId('character-instructions-input')).toHaveValue('New Instructions');

  // Initial message
  await page.getByTestId('character-initial-message-input').fill('');
  await page.getByTestId('character-initial-message-input').fill('New Initial Message');
  await page.getByTestId('character-initial-message-input').press('Tab');
  await waitForAutosave(page);
  await page.reload();
  await expect(page.getByTestId('character-initial-message-input')).toHaveValue(
    'New Initial Message',
  );

  // cleanup
  await deleteCharacterFromDetailPage(page);
  await waitForToast(page, 'Der Dialogpartner wurde erfolgreich gelöscht.');
});
