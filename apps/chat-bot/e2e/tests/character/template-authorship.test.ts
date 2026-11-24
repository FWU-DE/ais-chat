import type { Browser, Locator, Page } from '@playwright/test';
import { nanoid } from 'nanoid';

import { expect, test } from '../../fixtures/test';
import {
  configureCharacter,
  createCharacter,
  deleteCharacterFromDetailPage,
} from '../../utils/character';
import {
  approveRequestInAdmin,
  expectNoRequestCard,
  openRequestInAdmin,
  submitToCommunity,
} from '../../utils/community-template';
import { ADMIN_BASE_URL, AUTH_FILES, EDITOR_AUTH_FILE } from '../../utils/const';
import { waitForAutosave, waitForToast } from '../../utils/utils';

async function newAuthenticatedPage(browser: Browser, sourcePage: Page, storageState: string) {
  const viewport = sourcePage.viewportSize();
  const isMobile = viewport?.width === 390;
  const context = await browser.newContext({
    storageState,
    baseURL: new URL(sourcePage.url()).origin,
    viewport: viewport ?? undefined,
    isMobile,
    hasTouch: isMobile,
  });
  return context.newPage();
}

async function waitForSharingSettled(page: Page) {
  await expect(page.locator('#share-settings')).toHaveAttribute('aria-busy', 'false');
}

async function setSharingState(page: Page, locator: Locator, checked: boolean) {
  await waitForSharingSettled(page);
  if ((await locator.getAttribute('aria-checked')) !== String(checked)) {
    await locator.click();
  }
  await expect(locator).toHaveAttribute('aria-checked', String(checked));
  await waitForSharingSettled(page);
}

test.use({ storageState: AUTH_FILES.teacher });

test.describe('character template authorship', { tag: '@smoke' }, () => {
  let createdName: string | undefined;
  let createdEditorPath: string | undefined;

  test.afterEach(async ({ page }) => {
    if (createdName === undefined || createdEditorPath === undefined) {
      return;
    }

    try {
      await page.goto(createdEditorPath);
      await deleteCharacterFromDetailPage(page);
      await waitForToast(page, 'Der Dialogpartner wurde erfolgreich gelöscht.');
      await page.waitForURL('/characters');
    } finally {
      createdName = undefined;
      createdEditorPath = undefined;
    }
  });

  test('keeps the optional author credit in the sharing lifecycle', async ({
    browser,
    page,
  }, testInfo) => {
    const name = `Authorship character ${nanoid(8)}`;
    const initialAuthor = `TD-1710 character author ${nanoid(8)}`;
    const updatedAuthor = `TD-1710 updated character author ${nanoid(8)}`;
    const finalAuthor = `TD-1710 final character author ${nanoid(8)}`;
    const retainedAuthor = `${finalAuthor} & Coauthor`;
    const author = page.getByLabel(/Autorinnen und Autoren/i).first();

    await createCharacter(page);
    createdName = name;
    createdEditorPath = page.url();
    await testInfo.attach('created-entity-metadata', {
      body: JSON.stringify({ name, editorPath: createdEditorPath }),
      contentType: 'application/json',
    });
    await configureCharacter(page, { name });

    await expect(author).toBeHidden();

    const sharing = page.getByTestId('school-sharing-checkbox');
    await setSharingState(page, sharing, true);
    await expect(author).toBeVisible();
    await author.fill(initialAuthor);
    await author.press('Tab');
    await waitForAutosave(page);
    await waitForSharingSettled(page);
    await page.reload();
    await expect(author).toHaveValue(initialAuthor);
    await author.scrollIntoViewIfNeeded();
    await expect(author).toBeInViewport();
    await testInfo.attach('author-editor', {
      body: await author.screenshot(),
      contentType: 'image/png',
    });

    await author.fill('   ');
    await author.press('Tab');
    await waitForAutosave(page);
    await page.reload();
    await expect(author).toHaveValue('   ');
    const blankViewPage = await newAuthenticatedPage(browser, page, AUTH_FILES.teacher2);
    try {
      await blankViewPage.goto(page.url().replace('/editor', ''));
      await expect(blankViewPage.locator('body')).toContainText(name);
      await expect(blankViewPage.locator('body')).not.toContainText('Erstellt von');
    } finally {
      await blankViewPage.context().close();
    }

    await author.fill(initialAuthor);
    await author.press('Tab');
    await waitForAutosave(page);

    await author.fill(updatedAuthor);
    await author.press('Tab');
    await waitForAutosave(page);
    await page.reload();
    await expect(author).toHaveValue(updatedAuthor);

    const sharedPage = await newAuthenticatedPage(browser, page, AUTH_FILES.teacher2);
    try {
      await sharedPage.goto('/characters?filter=all');
      await sharedPage.waitForURL('/characters**');
      const card = sharedPage.getByTestId('entity-card').filter({ hasText: name }).first();
      await expect(card).toBeVisible();
      await card.getByTestId('entity-link').click();
      await sharedPage.waitForURL('/characters/**');
      await expect(sharedPage.locator('body')).toContainText(updatedAuthor);
      await sharedPage.getByText(updatedAuthor, { exact: true }).first().scrollIntoViewIfNeeded();
      await testInfo.attach('shared-author-credit', {
        body: await sharedPage.screenshot(),
        contentType: 'image/png',
      });
    } finally {
      await sharedPage.context().close();
    }

    await setSharingState(page, sharing, false);
    await waitForAutosave(page);
    await page.reload();
    await expect(author).toBeHidden();

    await setSharingState(page, sharing, true);
    await expect(author).toBeVisible();
    await expect(author).toHaveValue(updatedAuthor);
    await waitForAutosave(page);

    const linkSharing = page.getByRole('checkbox', { name: 'Via Link', exact: true });
    await setSharingState(page, linkSharing, true);
    await expect(author).toBeVisible();

    await setSharingState(page, sharing, false);
    await author.fill(finalAuthor);
    await author.press('Tab');
    await waitForAutosave(page);
    await expect(author).toBeVisible();
    await page.reload();
    await expect(author).toBeVisible();
    await expect(author).toHaveValue(finalAuthor);

    const ownerViewUrl = page.url().replace('/editor', '');
    const linkSharedPage = await newAuthenticatedPage(browser, page, AUTH_FILES.teacher2);
    try {
      await linkSharedPage.goto(ownerViewUrl);
      await expect(linkSharedPage.locator('body')).toContainText(finalAuthor);
      await linkSharedPage.getByText(finalAuthor, { exact: true }).first().scrollIntoViewIfNeeded();
      await testInfo.attach('link-shared-author-credit', {
        body: await linkSharedPage.screenshot(),
        contentType: 'image/png',
      });
    } finally {
      await linkSharedPage.context().close();
    }

    await author.fill(retainedAuthor);
    await setSharingState(page, linkSharing, false);
    await waitForAutosave(page);
    await expect(author).toBeHidden();
    await page.reload();
    await expect(author).toBeHidden();

    await setSharingState(page, linkSharing, true);
    await expect(author).toBeVisible();
    await expect(author).toHaveValue(retainedAuthor);
    await waitForAutosave(page);
  });

  test('keeps the optional author credit in the community lifecycle', async ({
    browser,
    page,
  }, testInfo) => {
    const name = `Community authorship character ${nanoid(8)}`;
    const requestAuthor = `TD-1710 community character author ${nanoid(8)}`;
    const activeAuthor = `TD-1710 active character author ${nanoid(8)}`;

    await createCharacter(page);
    createdName = name;
    createdEditorPath = page.url();
    await testInfo.attach('created-entity-metadata', {
      body: JSON.stringify({ name, editorPath: createdEditorPath }),
      contentType: 'application/json',
    });
    await configureCharacter(page, { name });
    const editorPath = page.url();
    const author = page.getByLabel(/Autorinnen und Autoren/i).first();
    await expect(author).toBeHidden();

    await submitToCommunity(page);
    await expect(author).toBeVisible();
    await author.fill(requestAuthor);
    await author.press('Tab');
    await waitForAutosave(page);
    await page.reload();
    await expect(author).toHaveValue(requestAuthor);

    const adminContext = await browser.newContext({
      storageState: EDITOR_AUTH_FILE,
      baseURL: ADMIN_BASE_URL,
    });
    const adminPage = await adminContext.newPage();

    try {
      await openRequestInAdmin(adminPage, name);
      await approveRequestInAdmin(adminPage);
    } finally {
      await adminContext.close();
    }

    await page.goto(editorPath);
    await expectNoRequestCard(page);
    const sharedPage = await newAuthenticatedPage(browser, page, AUTH_FILES.teacher2);
    try {
      await sharedPage.goto('/characters');
      await sharedPage.getByTestId('filter-tab-community').click();
      const card = sharedPage.getByTestId('entity-card').filter({ hasText: name }).first();
      await expect(card).toBeVisible();
      await card.getByTestId('entity-link').click();
      await sharedPage.waitForURL('/characters/**');
      await expect(sharedPage.locator('body')).toContainText(requestAuthor);
      await sharedPage.getByText(requestAuthor, { exact: true }).first().scrollIntoViewIfNeeded();
      await testInfo.attach('community-shared-author-credit', {
        body: await sharedPage.screenshot(),
        contentType: 'image/png',
      });
    } finally {
      await sharedPage.context().close();
    }

    await author.fill(activeAuthor);
    await author.press('Tab');
    await waitForAutosave(page);
    const activeViewPage = await newAuthenticatedPage(browser, page, AUTH_FILES.teacher2);
    try {
      await activeViewPage.goto(page.url().replace('/editor', ''));
      await expect(activeViewPage.locator('body')).toContainText(name);
      await expect(activeViewPage.locator('body')).toContainText(activeAuthor);
      await activeViewPage
        .getByText(activeAuthor, { exact: true })
        .first()
        .scrollIntoViewIfNeeded();
      await testInfo.attach('community-edited-author-credit', {
        body: await activeViewPage.screenshot(),
        contentType: 'image/png',
      });
    } finally {
      await activeViewPage.context().close();
    }

    const communitySharing = page.getByTestId('community-sharing-checkbox');
    await communitySharing.click();
    const removalDialog = page.getByRole('alertdialog');
    await expect(removalDialog).toBeVisible();
    await removalDialog.getByRole('button', { name: 'Freigabe entfernen', exact: true }).click();
    await waitForSharingSettled(page);

    const schoolSharing = page.getByTestId('school-sharing-checkbox');
    const linkSharing = page.getByRole('checkbox', { name: 'Via Link', exact: true });
    await setSharingState(page, schoolSharing, false);
    await setSharingState(page, linkSharing, false);
    await waitForAutosave(page);
    await expect(author).toBeHidden();
    await page.reload();
    await expect(author).toBeHidden();

    await setSharingState(page, schoolSharing, true);
    await expect(author).toBeVisible();
    await expect(author).toHaveValue(activeAuthor);
    await waitForAutosave(page);
  });
});
