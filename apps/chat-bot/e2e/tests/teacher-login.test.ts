import { expect, test } from '@playwright/test';
import { AUTH_FILES } from '../utils/const';
import { sendMessage } from '../utils/chat';
import { login } from '../utils/login';

test.describe('with stored auth', () => {
  test.use({ storageState: AUTH_FILES.teacher });

  test('can login as teacher and send a message', { tag: '@smoke' }, async ({ page }) => {
    await page.goto('/');

    // send first message
    await sendMessage(page, 'Wieviel ist 2+2?');
    await expect(page.getByLabel('user message 1')).toContainText('Wieviel ist 2+2?');
    await expect(page.getByLabel('assistant message 1')).toContainText(/\S/);

    // send second message
    await sendMessage(page, 'Wieviel ist 3+3?');
    await expect(page.getByLabel('user message 2')).toContainText('Wieviel ist 3+3?');
    await expect(page.getByLabel('assistant message 2')).toContainText(/\S/);
  });
});

for (const idpHint of [true, false]) {
  test(`can login as teacher with idpHint=${idpHint}`, async ({ page }) => {
    await login(page, 'teacher', undefined, { idpHint });
    await expect(page).toHaveURL('/');
  });
}
