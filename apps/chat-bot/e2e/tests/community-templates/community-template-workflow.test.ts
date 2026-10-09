import { expect, test } from '@playwright/test';
import { nanoid } from 'nanoid';
import { ADMIN_BASE_URL, AUTH_FILES, EDITOR_AUTH_FILE } from '../../utils/const';
import { configureCharacter, createCharacter, deleteCharacter } from '../../utils/character';
import {
  approveRequestInAdmin,
  expectAdminState,
  expectNoRequestCard,
  expectRequestStatus,
  openRequestInAdmin,
  rejectRequestInAdmin,
  resubmitRequest,
  sendMessageToEditor,
  submitToCommunity,
} from '../../utils/community-template';

test.use({ storageState: AUTH_FILES.teacher });

test.describe('community template workflow', { tag: '@smoke' }, () => {
  test('character is submitted, rejected, resubmitted and approved across chat-bot and admin', async ({
    page,
    browser,
  }) => {
    const characterName = 'Community Character ' + nanoid(8);
    const editorMessage = 'Bitte prüft meine Community-Vorlage.';
    const rejectionMessage = 'Bitte die Beschreibung überarbeiten. ' + nanoid(6);

    // Author: create and configure a character
    await createCharacter(page);
    await configureCharacter(page, { name: characterName });
    const editorPath = new URL(page.url()).pathname;

    // Author: submit to community and send a message to the editorial team
    await submitToCommunity(page);
    await sendMessageToEditor(page, editorMessage);

    const adminContext = await browser.newContext({
      storageState: EDITOR_AUTH_FILE,
      baseURL: ADMIN_BASE_URL,
    });
    const adminPage = await adminContext.newPage();

    try {
      // Editor: open the request and verify the author's message is visible
      await openRequestInAdmin(adminPage, characterName);
      await expect(
        adminPage
          .getByTestId('community-template-event-message')
          .filter({ hasText: editorMessage }),
      ).toBeVisible();

      // Editor: reject with a custom message
      await rejectRequestInAdmin(adminPage, rejectionMessage);

      // Author: sees the rejected state and the rejection message
      await page.goto(editorPath);
      await expectRequestStatus(page, 'Änderung erforderlich');
      await expect(
        page
          .getByTestId('community-template-request-event-message')
          .filter({ hasText: rejectionMessage }),
      ).toBeVisible();

      // Author: resubmit the character
      await resubmitRequest(page);

      // Editor: sees the resubmitted state
      await adminPage.reload();
      await expectAdminState(adminPage, 'Eingereicht');

      // Editor: approve the request
      await approveRequestInAdmin(adminPage);
    } finally {
      await adminContext.close();
    }

    // Author: approved request is no longer shown in the editor
    await page.goto(editorPath);
    await expectNoRequestCard(page);

    // Author: character is visible in the community-filtered list
    await page.goto('/characters');
    await page.getByTestId('filter-tab-community').click();
    await expect(
      page.getByTestId('entity-card').filter({ hasText: characterName }).first(),
    ).toBeVisible();

    // Cleanup
    await deleteCharacter(page, characterName);
  });
});
