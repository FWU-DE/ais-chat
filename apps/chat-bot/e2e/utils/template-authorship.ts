import type { Browser, Locator, Page, TestInfo } from '@playwright/test';
import { nanoid } from 'nanoid';

import { expect, test } from '../fixtures/test';
import {
  approveRequestInAdmin,
  expectNoRequestCard,
  openRequestInAdmin,
  submitToCommunity,
} from './community-template';
import { ADMIN_BASE_URL, AUTH_FILES, EDITOR_AUTH_FILE } from './const';
import { waitForAutosave, waitForToast } from './utils';

/**
 * Entity-specific parts of the template authorship lifecycle
 * (assistants, characters and learning scenarios share the same author field behaviour).
 */
export type TemplateAuthorshipEntity = {
  /** Used in describe blocks, e.g. "assistant" */
  title: string;
  /** Used in generated names and author credits, e.g. "assistant" */
  label: string;
  /** List route, e.g. "/assistants" */
  listPath: string;
  deleteToast: string;
  create: (page: Page) => Promise<void>;
  configure: (page: Page, name: string) => Promise<void>;
  deleteFromDetailPage: (page: Page) => Promise<void>;
};

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

// The autosave indicator still shows the previous save, so wait for the save request itself.
async function saveAuthor(page: Page, author: Locator, value: string) {
  const saveRequest = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes('/editor/'),
  );
  await author.fill(value);
  await author.press('Tab');
  await saveRequest;
  await waitForAutosave(page);
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

export function defineTemplateAuthorshipTests(entity: TemplateAuthorshipEntity) {
  test.use({ storageState: AUTH_FILES.teacher });

  test.describe(`${entity.title} template authorship`, { tag: '@smoke' }, () => {
    let createdEditorPath: string | undefined;

    async function createEntity(page: Page, name: string, testInfo: TestInfo) {
      await entity.create(page);
      createdEditorPath = page.url();
      await testInfo.attach('created-entity-metadata', {
        body: JSON.stringify({ name, editorPath: createdEditorPath }),
        contentType: 'application/json',
      });
      await entity.configure(page, name);
    }

    async function attachScreenshot(page: Page, name: string, text: string, testInfo: TestInfo) {
      await page.getByText(text, { exact: true }).first().scrollIntoViewIfNeeded();
      await testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
    }

    test.afterEach(async ({ page }) => {
      if (createdEditorPath === undefined) {
        return;
      }

      try {
        await page.goto(createdEditorPath);
        await entity.deleteFromDetailPage(page);
        await waitForToast(page, entity.deleteToast);
        await page.waitForURL(entity.listPath);
      } finally {
        createdEditorPath = undefined;
      }
    });

    test('keeps the optional author credit in the sharing lifecycle', async ({
      browser,
      page,
    }, testInfo) => {
      const name = `Authorship ${entity.label} ${nanoid(8)}`;
      const initialAuthor = `TD-1710 ${entity.label} author ${nanoid(8)}`;
      const updatedAuthor = `TD-1710 updated ${entity.label} author ${nanoid(8)}`;
      const finalAuthor = `TD-1710 final ${entity.label} author ${nanoid(8)}`;
      const retainedAuthor = `${finalAuthor} & Coauthor`;
      const author = page.getByLabel('Autor/Autorin dieser Vorlage', { exact: true });

      await createEntity(page, name, testInfo);
      await expect(author).toBeHidden();

      const sharing = page.getByTestId('school-sharing-checkbox');
      await setSharingState(page, sharing, true);
      await expect(author).toBeVisible();
      await saveAuthor(page, author, initialAuthor);
      await waitForSharingSettled(page);
      await page.reload();
      await expect(author).toHaveValue(initialAuthor);
      await author.scrollIntoViewIfNeeded();
      await expect(author).toBeInViewport();
      await testInfo.attach('author-editor', {
        body: await author.screenshot(),
        contentType: 'image/png',
      });

      // A whitespace-only credit is stored but not shown in the shared view
      await saveAuthor(page, author, '   ');
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

      await saveAuthor(page, author, initialAuthor);
      await saveAuthor(page, author, updatedAuthor);
      await page.reload();
      await expect(author).toHaveValue(updatedAuthor);

      const sharedPage = await newAuthenticatedPage(browser, page, AUTH_FILES.teacher2);
      try {
        await sharedPage.goto(`${entity.listPath}?filter=all`);
        await sharedPage.waitForURL(`${entity.listPath}**`);
        const card = sharedPage.getByTestId('entity-card').filter({ hasText: name }).first();
        await expect(card).toBeVisible();
        await card.getByTestId('entity-link').click();
        await sharedPage.waitForURL(`${entity.listPath}/**`);
        await expect(sharedPage.locator('body')).toContainText(updatedAuthor);
        await attachScreenshot(sharedPage, 'shared-author-credit', updatedAuthor, testInfo);
      } finally {
        await sharedPage.context().close();
      }

      // Withdrawing all sharing hides the field but keeps the credit
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

      // The field stays visible while link sharing remains active
      await setSharingState(page, sharing, false);
      await saveAuthor(page, author, finalAuthor);
      await expect(author).toBeVisible();
      await page.reload();
      await expect(author).toBeVisible();
      await expect(author).toHaveValue(finalAuthor);

      const linkSharedPage = await newAuthenticatedPage(browser, page, AUTH_FILES.teacher2);
      try {
        await linkSharedPage.goto(page.url().replace('/editor', ''));
        await expect(linkSharedPage.locator('body')).toContainText(finalAuthor);
        await attachScreenshot(linkSharedPage, 'link-shared-author-credit', finalAuthor, testInfo);
      } finally {
        await linkSharedPage.context().close();
      }

      // An unsaved edit right before withdrawing the last scope is still persisted
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
      const name = `Community authorship ${entity.label} ${nanoid(8)}`;
      const requestAuthor = `TD-1710 community ${entity.label} author ${nanoid(8)}`;
      const activeAuthor = `TD-1710 active ${entity.label} author ${nanoid(8)}`;
      const author = page.getByLabel('Autor/Autorin dieser Vorlage', { exact: true });

      await createEntity(page, name, testInfo);
      const editorPath = page.url();
      await expect(author).toBeHidden();

      await submitToCommunity(page);
      await expect(author).toBeVisible();
      await saveAuthor(page, author, requestAuthor);
      await page.reload();
      await expect(author).toHaveValue(requestAuthor);

      const adminContext = await browser.newContext({
        storageState: EDITOR_AUTH_FILE,
        baseURL: ADMIN_BASE_URL,
      });
      const adminListPage = await adminContext.newPage();

      try {
        // The request detail view opens in a new tab
        const adminPage = await openRequestInAdmin(adminListPage, name);
        await approveRequestInAdmin(adminPage);
      } finally {
        await adminContext.close();
      }

      await page.goto(editorPath);
      await expectNoRequestCard(page);
      const sharedPage = await newAuthenticatedPage(browser, page, AUTH_FILES.teacher2);
      try {
        await sharedPage.goto(entity.listPath);
        await sharedPage.getByTestId('filter-tab-community').click();
        const card = sharedPage.getByTestId('entity-card').filter({ hasText: name }).first();
        await expect(card).toBeVisible();
        await card.getByTestId('entity-link').click();
        await sharedPage.waitForURL(`${entity.listPath}/**`);
        await expect(sharedPage.locator('body')).toContainText(requestAuthor);
        await attachScreenshot(
          sharedPage,
          'community-shared-author-credit',
          requestAuthor,
          testInfo,
        );
      } finally {
        await sharedPage.context().close();
      }

      await saveAuthor(page, author, activeAuthor);
      const activeViewPage = await newAuthenticatedPage(browser, page, AUTH_FILES.teacher2);
      try {
        await activeViewPage.goto(page.url().replace('/editor', ''));
        await expect(activeViewPage.locator('body')).toContainText(name);
        await expect(activeViewPage.locator('body')).toContainText(activeAuthor);
        await attachScreenshot(
          activeViewPage,
          'community-edited-author-credit',
          activeAuthor,
          testInfo,
        );
      } finally {
        await activeViewPage.context().close();
      }

      await page.getByTestId('community-sharing-checkbox').click();
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
}
