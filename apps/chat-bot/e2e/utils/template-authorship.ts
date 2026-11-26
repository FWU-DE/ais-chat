import type { Browser, Locator, Page, TestInfo } from '@playwright/test';
import type { EntityType } from '@shared/entities/entity-types';
import { nanoid } from 'nanoid';

import { expect, test } from '../fixtures/test';
import {
  approveRequestForEntity,
  expectNoRequestCard,
  submitToCommunity,
} from './community-template';
import { AUTH_FILES } from './const';
import { waitForAutosave, waitForToast } from './utils';

/**
 * Entity-specific parts of the template authorship lifecycle
 * (assistants, characters and learning scenarios share the same author field behaviour).
 */
export type TemplateAuthorshipEntity = {
  entityType: EntityType;
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

      // A whitespace-only credit is stored but not shown in the shared view
      await saveAuthor(page, author, '   ');
      await page.reload();
      await expect(author).toHaveValue('   ');
      const sharedPage = await newAuthenticatedPage(browser, page, AUTH_FILES.teacher2);
      try {
        await sharedPage.goto(page.url().replace('/editor', ''));
        await expect(sharedPage.locator('body')).toContainText(name);
        await expect(sharedPage.locator('body')).not.toContainText('Erstellt von');

        await saveAuthor(page, author, initialAuthor);
        await saveAuthor(page, author, updatedAuthor);
        await page.reload();
        await expect(author).toHaveValue(updatedAuthor);

        await sharedPage.goto(`${entity.listPath}?filter=all`);
        await sharedPage.waitForURL(`${entity.listPath}**`);
        const card = sharedPage.getByTestId('entity-card').filter({ hasText: name }).first();
        await expect(card).toBeVisible();
        await card.getByTestId('entity-link').click();
        await sharedPage.waitForURL(`${entity.listPath}/**`);
        await expect(sharedPage.locator('body')).toContainText(updatedAuthor);

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

        await sharedPage.goto(page.url().replace('/editor', ''));
        await expect(sharedPage.locator('body')).toContainText(finalAuthor);

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
      } finally {
        await sharedPage.context().close();
      }
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

      await approveRequestForEntity({
        entityType: entity.entityType,
        entityId: new URL(editorPath).pathname.split('/').at(-1) ?? '',
      });

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

        await saveAuthor(page, author, activeAuthor);
        await sharedPage.goto(page.url().replace('/editor', ''));
        await expect(sharedPage.locator('body')).toContainText(name);
        await expect(sharedPage.locator('body')).toContainText(activeAuthor);

        await page.getByTestId('community-sharing-checkbox').click();
        const removalDialog = page.getByRole('alertdialog');
        await expect(removalDialog).toBeVisible();
        await removalDialog
          .getByRole('button', { name: 'Freigabe entfernen', exact: true })
          .click();
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
      } finally {
        await sharedPage.context().close();
      }
    });
  });
}
