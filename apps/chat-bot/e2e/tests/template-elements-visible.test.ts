import { expect, test } from '../fixtures/test';
import { AUTH_FILES } from '../utils/const';

const templateCharactersIdentifier = ['Johann Wolfgang von Goethe'];
const templateAssistantsIdentifier = ['Schulorganisationsassistent'];
const templateLearningScenariosIdentifier = ['Lern was über KI'];

test.use({ storageState: AUTH_FILES.teacher });

test('all predefined characters are visible for everyone', async ({ page }) => {
  await page.goto('/characters?filter=all');

  await page.waitForURL('/characters**');

  for (const elementIdentifier of templateCharactersIdentifier) {
    const card = page.getByTestId('entity-card').filter({ hasText: elementIdentifier }).first();
    await expect(card).toBeVisible();
  }
});

test('all predefined assistants are visible for everyone', async ({ page }) => {
  await page.goto('/assistants?filter=all');

  await page.waitForURL('/assistants**');

  for (const elementIdentifier of templateAssistantsIdentifier) {
    const card = page.getByTestId('entity-card').filter({ hasText: elementIdentifier }).first();
    await expect(card).toBeVisible();
  }
});

test('all predefined learning scenarios are visible for everyone', async ({ page }) => {
  await page.goto('/learning-scenarios?filter=all');

  await page.waitForURL('/learning-scenarios**');

  for (const elementIdentifier of templateLearningScenariosIdentifier) {
    const card = page.getByTestId('entity-card').filter({ hasText: elementIdentifier }).first();
    await expect(card).toBeVisible();
  }
});

test('default overview filter is mine when no filter is set', async ({ page }) => {
  await page.goto('/assistants');
  await page.waitForURL('/assistants**');

  await expect(page.getByTestId('filter-tab-mine')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('filter-tab-all')).toHaveAttribute('aria-pressed', 'false');
});
