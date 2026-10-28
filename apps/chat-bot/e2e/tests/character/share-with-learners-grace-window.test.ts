import { expect, test } from '../../fixtures/test';
import { AUTH_FILES } from '../../utils/const';
import { configureCharacter, createCharacter } from '../../utils/character';
import { startShare, stopShare, waitForAutosave } from '../../utils/utils';
import { nanoid } from 'nanoid';

test.describe('share character with grace window', () => {
  test.use({ storageState: AUTH_FILES.teacher });

  let characterId: string;

  test.beforeEach(async ({ page }) => {
    await createCharacter(page);
    await configureCharacter(page, { name: 'Grace Window Character Test - ' + nanoid(8) });
    await waitForAutosave(page);

    const url = page.url();
    const match = url.match(/characters\/editor\/([^/?]+)/);
    expect(match, `Expected character editor URL, got: ${url}`).not.toBeNull();
    characterId = match![1]!;
  });

  test('can extend a share session that has not yet expired', async ({ page }) => {
    await page.goto(`/characters/editor/${characterId}`);
    await startShare(page, { id: characterId });

    await expect(page.getByTestId('add-additional-time-button')).toBeVisible();
    await expect(page.getByTestId('stop-share-button')).toBeVisible();
  });

  test('can manually stop a share session', async ({ page }) => {
    await page.goto(`/characters/editor/${characterId}`);
    await startShare(page, { id: characterId });
    await stopShare(page);

    await expect(page.getByTestId('start-share-button')).toBeVisible();
  });
});
