import { expect, test, type Page } from '@playwright/test';
import { AUTH_FILES, MOCK_LLM_COMMANDS } from '../../utils/const';
import { waitForAutosave, waitForToast, waitForToastDisappear } from '../../utils/utils';
import { sendMessage } from '../../utils/chat';
import {
  configureLearningScenario,
  createLearningScenario,
  deleteLearningScenario,
  deleteLearningScenarioFromDetailPage,
} from '../../utils/learning-scenario';
import { nanoid } from 'nanoid';

test.use({ storageState: AUTH_FILES.teacher });

async function stopSharingIfActive(page: Page) {
  const stopSharingButton = page.getByTestId('stop-share-button');
  if (await stopSharingButton.isVisible()) {
    await stopSharingButton.click();
    const stopShareDialog = page.getByTestId('stop-share-dialog');
    await expect(stopShareDialog).toBeVisible();
    await page.getByTestId('stop-share-confirm-button').click();
    await expect(stopShareDialog).not.toBeVisible();
  }
}

test.describe('create, share, chat, delete', () => {
  const data = {
    additionalInstructions:
      'Der Chatbot soll aus der Perspektive eines Soldaten im Herrschaftssystem unter Ludwig XIV antworten.',
    description: 'Zwischen Absolutismus und Demokratie (Ludwig XIV)',
    gradeLevel: '10. Klasse',
    name: '', // will be set in beforeEach
    schoolType: 'Gymnasium',
    studentExercise:
      'Schüler sollen den Unterschied zwischen Absolutismus und Demokratie verstehen.',
    subject: 'Geschichte',
  };

  test.beforeEach(() => {
    data.name = 'Absolutismus unter Ludwig XIV – ' + nanoid(8);
  });

  test(
    'teacher can login, create and join learning scenario',
    { tag: '@smoke' },
    async ({ page }) => {
      await createLearningScenario(page);

      // configure form
      await configureLearningScenario(page, data);

      // check if created with the correct name (still on the editor page)
      await expect(page.getByRole('heading', { name: data.name })).toBeVisible();

      await stopSharingIfActive(page);
      // test share page
      await page.getByTestId('token-points-select').click();
      await page.getByTestId('token-points-option-50').click();
      await page.getByTestId('usage-time-select').click();
      await page.getByTestId('usage-time-option-30').click();
      await page.getByTestId('start-share-button').click();

      await page.waitForURL('/learning-scenarios/**/share');
      const code = await page.getByTestId('join-code').textContent();

      const countDown = page.getByTestId('countdown-timer');
      await expect(countDown).toBeVisible();

      const qrCode = page.getByTestId('qr-code');
      await expect(qrCode).toBeVisible();

      // verify countdown is also shown on the overview list
      await page.goto('/learning-scenarios');
      await page.waitForURL('/learning-scenarios**');
      const card = page.getByTestId('entity-card').filter({ hasText: data.name }).first();
      await expect(card).toBeVisible();
      await expect(card.getByRole('timer')).toBeVisible();

      // join chat as teacher
      await page.goto('/logout');
      await page.waitForURL('/login');

      await page.locator('#login-invite-code').fill(code ?? '');

      const loginButton = page.getByRole('button', { name: 'Zum Dialog' });
      await expect(loginButton).toBeVisible();
      await loginButton.click();

      await page.waitForURL('/ua/learning-scenarios/**/dialog?inviteCode=*');
    },
  );

  test('teacher can login and create learning scenario, student can join and restart chat', async ({
    page,
  }) => {
    await createLearningScenario(page);

    // configure form
    await configureLearningScenario(page, data);

    // Still on the editor page after autosave
    await stopSharingIfActive(page);
    // test share page
    await page.getByTestId('token-points-select').click();
    await page.getByTestId('token-points-option-25').click();
    await page.getByTestId('usage-time-select').click();
    await page.getByTestId('usage-time-option-30').click();
    await page.getByTestId('start-share-button').click();

    // get code
    await page.waitForURL('/learning-scenarios/**/share');
    const code = await page.getByTestId('join-code').textContent();

    // join chat as student
    await page.goto('/logout');
    await page.waitForURL('/login');

    await page.locator('#login-invite-code').fill(code ?? '');

    const loginButton = page.getByRole('button', { name: 'Zum Dialog' });
    await expect(loginButton).toBeVisible();
    await loginButton.click();

    await page.waitForURL('/ua/learning-scenarios/**/dialog?inviteCode=*');

    // send first message
    const startButton = page.getByTestId('start-dialog-button');
    await expect(startButton).toBeVisible();
    await startButton.click();

    await sendMessage(page, `${MOCK_LLM_COMMANDS.RETURN_SYSTEM_PROMPT} Über wen lernen wir hier?`);

    // 'Ludwig XIV' is set in the learning scenario's additional instructions and description,
    // which are included in the system prompt; the mock LLM echoes the system prompt back.
    await expect(page.getByLabel('assistant message 1')).toContainText('Ludwig XIV');

    // new chat
    const newChatButton = page.getByTestId('custom-chat-delete-button').first();
    await expect(newChatButton).toBeVisible();
    await newChatButton.click();

    const deleteConfirmButton = page.getByTestId('confirm-alert-dialog-confirm-button');
    await expect(deleteConfirmButton).toBeVisible();
    await deleteConfirmButton.click();
  });

  test('teacher can delete learning scenario', async ({ page }) => {
    // create learning scenario
    await createLearningScenario(page);
    await configureLearningScenario(page, data);

    // Navigate back to list to find and delete
    await page.goto('/learning-scenarios');
    await page.waitForURL('/learning-scenarios');

    await deleteLearningScenario(page, data.name);

    await waitForToast(page, 'Das Lernszenario wurde erfolgreich gelöscht.');
    await expect(page.getByRole('heading', { name: data.name })).not.toBeVisible();
  });

  test('teacher sees previously selected fixed token volume preselected after stopping share', async ({
    page,
  }) => {
    await createLearningScenario(page);

    // configure form
    await configureLearningScenario(page, data);

    await stopSharingIfActive(page);

    // set share with learners limit params
    await page.getByTestId('token-points-select').click();
    await page.getByTestId('token-points-option-25').click();
    await page.getByTestId('usage-time-select').click();
    await page.getByTestId('usage-time-option-30').click();
    const editorUrl = page.url();
    await page.getByTestId('start-share-button').click();

    // verify share page
    await page.waitForURL('/learning-scenarios/**/share');
    await expect(page.getByTestId('countdown-timer')).toBeVisible();

    // stop share
    await page.goto(editorUrl);
    await page.waitForURL('/learning-scenarios/**');
    await stopSharingIfActive(page);
    await expect(page.getByTestId('start-share-button')).toBeVisible();

    // verify maximum token points is preselected
    await page.getByTestId('token-points-select').click();
    await expect(page.getByTestId('token-points-option-25')).toHaveAttribute(
      'data-state',
      'checked',
    );

    // Close the select popover so it cannot intercept subsequent clicks
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('token-points-option-25')).not.toBeVisible();

    // cleanup
    await deleteLearningScenarioFromDetailPage(page);
    await waitForToast(page);
  });
});

test('data is autosaved on blur', async ({ page }) => {
  await createLearningScenario(page);

  // Fill out the form initially
  const name = 'Autosave Test Scenario ' + nanoid(8);
  await configureLearningScenario(page, {
    name,
    additionalInstructions: 'Test behavior for autosave validation',
    description: 'Test description for autosave validation',
    studentExercise: 'Test task for autosave validation',
  });

  // Navigate back to list and then click to open for editing
  await page.goto('/learning-scenarios');
  await page.waitForURL('/learning-scenarios');
  const listItem = page.getByTestId('entity-card').filter({ hasText: name }).first();
  await expect(listItem).toBeVisible();
  await listItem.getByTestId('entity-link').click();
  await page.waitForURL('/learning-scenarios/**');
  await waitForToastDisappear(page); // wait for success toast to disappear before continuing

  // Edit and verify autosave for each field
  // Title
  await page.getByRole('textbox', { name: 'Name des Lernszenarios' }).fill('');
  await page.getByRole('textbox', { name: 'Name des Lernszenarios' }).fill('New Title');
  await page.getByRole('textbox', { name: 'Name des Lernszenarios' }).press('Tab');
  await waitForAutosave(page);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Name des Lernszenarios' })).toHaveValue(
    'New Title',
  );

  // Description
  await page.getByRole('textbox', { name: 'Kurzbeschreibung' }).fill('');
  await page.getByRole('textbox', { name: 'Kurzbeschreibung' }).fill('New Description');
  await page.getByRole('textbox', { name: 'Kurzbeschreibung' }).press('Tab');
  await waitForAutosave(page);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Kurzbeschreibung' })).toHaveValue(
    'New Description',
  );

  // Instructions
  await page.getByRole('textbox', { name: 'Instruktionen' }).fill('');
  await page.getByRole('textbox', { name: 'Instruktionen' }).fill('New Instructions');
  await page.getByRole('textbox', { name: 'Instruktionen' }).press('Tab');
  await waitForAutosave(page);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Instruktionen' })).toHaveValue(
    'New Instructions',
  );

  // Student Exercise
  await page.getByRole('textbox', { name: 'Arbeitsauftrag' }).fill('');
  await page.getByRole('textbox', { name: 'Arbeitsauftrag' }).fill('New Exercise');
  await page.getByRole('textbox', { name: 'Arbeitsauftrag' }).press('Tab');
  await waitForAutosave(page);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Arbeitsauftrag' })).toHaveValue('New Exercise');

  // cleanup
  await deleteLearningScenarioFromDetailPage(page);
  await waitForToast(page);
});
