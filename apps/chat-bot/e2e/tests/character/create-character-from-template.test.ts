import { expect, test } from '../../fixtures/test';
import { AUTH_FILES } from '../../utils/const';
import { nanoid } from 'nanoid';
import { confirmDuplicate } from '../../utils/utils';

test.use({ storageState: AUTH_FILES.teacher });

test('create character from template', async ({ page }) => {
  await page.goto('/characters?filter=all');

  const card = page
    .getByTestId('entity-card')
    .filter({ hasText: 'Johann Wolfgang von Goethe' })
    .first();
  await expect(card).toBeVisible();
  await card.getByTestId('entity-link').click();
  await page.waitForURL('/characters/**');

  const copyButton = page.getByTestId('custom-chat-duplicate-button').first();
  await expect(copyButton).toBeVisible();
  await expect(copyButton).toBeEnabled();
  await copyButton.click();
  await confirmDuplicate(page);
  await page.waitForURL('**?create=true**');

  const name = 'Johann Wolfgang von Goethe ' + nanoid(8);
  await page.getByTestId('character-name-input').fill(name);
  await page.getByTestId('character-initial-message-input').fill('Hallo');
  await page.goto('/characters');
  await expect(page.locator('body')).toContainText(name);
});
