import { expect, test } from '../../fixtures/test';
import { AUTH_FILES } from '../../utils/const';
import { configureLearningScenario, createLearningScenario } from '../../utils/learning-scenario';
import { startShare, stopShare, waitForAutosave } from '../../utils/utils';
import { nanoid } from 'nanoid';

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
});
