import { nanoid } from 'nanoid';

import { expect, test } from '../../fixtures/test';
import { createCharacter, deleteCharacter } from '../../utils/character';
import { AUTH_FILES } from '../../utils/const';

test.use({ storageState: AUTH_FILES.teacher });

test(
  'browser back from the character editor returns to the overview and keeps pending changes',
  { tag: '@smoke' },
  async ({ page }) => {
    const characterName = 'Back Button ' + nanoid(8);

    await createCharacter(page);
    await page.getByTestId('character-name-input').fill(characterName);

    await page.goBack();
    await expect(page).toHaveURL(/\/characters$/);

    await expect(page.getByText(characterName).first()).toBeVisible({ timeout: 15000 });

    await deleteCharacter(page, characterName);
  },
);

test('browser back waits for the pending save before leaving the character editor', async ({
  page,
}) => {
  const characterName = 'Back Wait ' + nanoid(8);

  await createCharacter(page);
  const editorUrl = page.url();

  let saveRequested: () => void = () => {};
  const saveRequestedPromise = new Promise<void>((resolve) => (saveRequested = resolve));
  let releaseSave: () => void = () => {};
  const releaseSavePromise = new Promise<void>((resolve) => (releaseSave = resolve));

  await page.route('**/characters/editor/**', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST' || request.headers()['next-action'] === undefined) {
      await route.continue();
      return;
    }
    saveRequested();
    await releaseSavePromise;
    await route.continue();
  });

  await page.getByTestId('character-name-input').fill(characterName);
  await page.evaluate(() => window.history.back());

  await saveRequestedPromise;
  await expect(page).toHaveURL(editorUrl);

  releaseSave();
  await expect(page).toHaveURL(/\/characters$/);
  await page.unroute('**/characters/editor/**');

  await expect(page.getByText(characterName).first()).toBeVisible({ timeout: 15000 });

  await deleteCharacter(page, characterName);
});
