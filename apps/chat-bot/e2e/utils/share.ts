import { expect, Page } from '@playwright/test';
import { db } from '@shared/db';
import { sharedCharacter, sharedLearningScenarioTable } from '@shared/db/schema';
import { eq } from 'drizzle-orm';

import { startShare } from './utils';

export type ShareEntity = 'character' | 'learning-scenario';

const MINUTE_MS = 60_000;

/**
 * Starts a share via the UI and moves its `expiredAt` into the past, so the share
 * is expired by `expiredMinutesAgo`. Reloads the editor afterwards.
 */
export async function startExpiredShare(
  page: Page,
  { entity, id, expiredMinutesAgo }: { entity: ShareEntity; id: string; expiredMinutesAgo: number },
) {
  await startShare(page, { id });

  const expiredAt = new Date(Date.now() - expiredMinutesAgo * MINUTE_MS);
  if (entity === 'character') {
    await db.update(sharedCharacter).set({ expiredAt }).where(eq(sharedCharacter.characterId, id));
  } else {
    await db
      .update(sharedLearningScenarioTable)
      .set({ expiredAt })
      .where(eq(sharedLearningScenarioTable.learningScenarioId, id));
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
}

export async function extendShare(page: Page) {
  const openButton = page.getByTestId('add-additional-time-button');
  const confirmButton = page.getByTestId('add-additional-time-confirm-button');

  // The click can land before hydration, so retry until the dialog opens.
  await expect(async () => {
    if (!(await confirmButton.isVisible())) {
      await openButton.click();
    }
    await expect(confirmButton).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });

  await confirmButton.click();
  await expect(confirmButton).not.toBeVisible();
}
