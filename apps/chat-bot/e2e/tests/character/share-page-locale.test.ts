import { expect, test } from '../../fixtures/test';
import type { Page } from '@playwright/test';
import { nanoid } from 'nanoid';
import { AUTH_FILES } from '../../utils/const';
import { configureCharacter, createCharacter, deleteCharacter } from '../../utils/character';
import { waitForAutosave, waitForToast } from '../../utils/utils';

test.use({ storageState: AUTH_FILES.teacher });

async function selectSingleLanguageFilter(page: Page, label: 'Deutsch' | 'Englisch') {
  await page.getByTestId('filter-language-select').click();
  await page.getByRole('menuitemcheckbox', { name: label }).click();
  await page.keyboard.press('Escape');
  await waitForAutosave(page);
}

async function openSharePage(page: Page) {
  await page.getByTestId('token-points-select').click();
  await page.getByTestId('token-points-option-25').click();
  await page.getByTestId('usage-time-select').click();
  await page.getByTestId('usage-time-option-30').click();
  await page.getByTestId('start-share-button').click();
  await page.waitForURL('/characters/editor/**/share');
}

test.describe('character share-page locale resolution', () => {
  test('uses English locale when single filter language is Englisch', async ({ page }) => {
    const characterName = 'Locale EN Character ' + nanoid(8);

    await createCharacter(page);
    await configureCharacter(page, {
      name: characterName,
      description: 'English locale selection test',
      instructions: 'Use this character for locale checks.',
    });

    await selectSingleLanguageFilter(page, 'Englisch');
    await openSharePage(page);

    await expect(page.getByText('Go to')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to dialog partner' })).toBeVisible();

    await page.goto('/characters');
    await deleteCharacter(page, characterName);
    await waitForToast(page, 'Der Dialogpartner wurde erfolgreich gelöscht.');
  });

  test('uses German locale when single filter language is Deutsch', async ({ page }) => {
    const characterName = 'Locale DE Character ' + nanoid(8);

    await createCharacter(page);
    await configureCharacter(page, {
      name: characterName,
      description: 'German locale selection test',
      instructions: 'Nutze diesen Dialogpartner für Lokalisierungs-Checks.',
    });

    await selectSingleLanguageFilter(page, 'Deutsch');
    await openSharePage(page);

    await expect(page.getByText('Gehe auf')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Zum Dialogpartner' })).toBeVisible();

    await page.goto('/characters');
    await deleteCharacter(page, characterName);
    await waitForToast(page, 'Der Dialogpartner wurde erfolgreich gelöscht.');
  });
});
