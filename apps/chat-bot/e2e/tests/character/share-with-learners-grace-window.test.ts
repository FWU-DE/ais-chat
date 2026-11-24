import { nanoid } from 'nanoid';

import { expect, test } from '../../fixtures/test';
import { configureCharacter, createCharacter } from '../../utils/character';
import { AUTH_FILES } from '../../utils/const';
import { extendShare, startExpiredShare } from '../../utils/share';
import { startShare, stopShare, waitForAutosave } from '../../utils/utils';

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

  // Offsets are far from the 2-hour grace window boundary, so slow runs cannot flip the state.
  test('shows an expired share within the grace window and allows extending it', async ({
    page,
  }) => {
    await page.goto(`/characters/editor/${characterId}`);
    await startExpiredShare(page, {
      entity: 'character',
      id: characterId,
      expiredMinutesAgo: 30,
    });

    await expect(page.getByTestId('grace-window-note')).toBeVisible();
    await expect(page.getByTestId('open-share-page-button')).toBeDisabled();
    await expect(page.getByTestId('start-share-button')).not.toBeVisible();

    await extendShare(page);

    await expect(page.getByTestId('grace-window-note')).not.toBeVisible();
    await expect(page.getByTestId('open-share-page-button')).toBeEnabled();
  });

  test('can stop an expired share within the grace window', async ({ page }) => {
    await page.goto(`/characters/editor/${characterId}`);
    await startExpiredShare(page, {
      entity: 'character',
      id: characterId,
      expiredMinutesAgo: 30,
    });
    await expect(page.getByTestId('grace-window-note')).toBeVisible();

    await stopShare(page);

    await expect(page.getByTestId('start-share-button')).toBeVisible();
    await expect(page.getByTestId('grace-window-note')).not.toBeVisible();
  });

  test('allows a new share after the grace window has passed', async ({ page }) => {
    await page.goto(`/characters/editor/${characterId}`);
    await startExpiredShare(page, {
      entity: 'character',
      id: characterId,
      expiredMinutesAgo: 3 * 60,
    });

    await expect(page.getByTestId('grace-window-note')).not.toBeVisible();
    await expect(page.getByTestId('start-share-button')).toBeVisible();

    await startShare(page, { id: characterId });
    await expect(page.getByTestId('add-additional-time-button')).toBeVisible();
  });
});
