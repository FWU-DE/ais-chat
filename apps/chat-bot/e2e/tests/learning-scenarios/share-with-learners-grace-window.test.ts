import { nanoid } from 'nanoid';

import { expect, test } from '../../fixtures/test';
import { AUTH_FILES } from '../../utils/const';
import { configureLearningScenario, createLearningScenario } from '../../utils/learning-scenario';
import { extendShare, startExpiredShare } from '../../utils/share';
import { startShare, stopShare, waitForAutosave } from '../../utils/utils';

test.describe('share learning scenario with 2-hour grace window', () => {
  test.use({ storageState: AUTH_FILES.teacher });

  let learningScenarioId: string;

  test.beforeEach(async ({ page }) => {
    await createLearningScenario(page);
    await configureLearningScenario(page, { name: 'Grace Window Test - ' + nanoid(8) });
    await waitForAutosave(page);

    const url = page.url();
    const match = url.match(/learning-scenarios\/editor\/([^/?]+)/);
    expect(match, `Expected learning scenario editor URL, got: ${url}`).not.toBeNull();
    learningScenarioId = match![1]!;
  });

  test('can extend a share session that has not yet expired', async ({ page }) => {
    await page.goto(`/learning-scenarios/editor/${learningScenarioId}`);
    await startShare(page, { id: learningScenarioId });

    await expect(page.getByTestId('add-additional-time-button')).toBeVisible();
    await expect(page.getByTestId('stop-share-button')).toBeVisible();

    // Running shares should allow opening the share page
    await expect(page.getByTestId('open-share-page-button')).toBeEnabled();
  });

  test('can manually stop a share session', async ({ page }) => {
    await page.goto(`/learning-scenarios/editor/${learningScenarioId}`);
    await startShare(page, { id: learningScenarioId });
    await stopShare(page);

    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('start-share-button')).toBeVisible();
  });

  // Offsets are far from the 2-hour grace window boundary, so slow runs cannot flip the state.
  test('shows an expired share within the grace window and allows extending it', async ({
    page,
  }) => {
    await page.goto(`/learning-scenarios/editor/${learningScenarioId}`);
    await startExpiredShare(page, {
      entity: 'learning-scenario',
      id: learningScenarioId,
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
    await page.goto(`/learning-scenarios/editor/${learningScenarioId}`);
    await startExpiredShare(page, {
      entity: 'learning-scenario',
      id: learningScenarioId,
      expiredMinutesAgo: 30,
    });
    await expect(page.getByTestId('grace-window-note')).toBeVisible();

    await stopShare(page);

    await expect(page.getByTestId('start-share-button')).toBeVisible();
    await expect(page.getByTestId('grace-window-note')).not.toBeVisible();
  });

  test('allows a new share after the grace window has passed', async ({ page }) => {
    await page.goto(`/learning-scenarios/editor/${learningScenarioId}`);
    await startExpiredShare(page, {
      entity: 'learning-scenario',
      id: learningScenarioId,
      expiredMinutesAgo: 3 * 60,
    });

    await expect(page.getByTestId('grace-window-note')).not.toBeVisible();
    await expect(page.getByTestId('start-share-button')).toBeVisible();

    await startShare(page, { id: learningScenarioId });
    await expect(page.getByTestId('add-additional-time-button')).toBeVisible();
  });
});
