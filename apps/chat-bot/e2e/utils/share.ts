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
  await page.getByTestId('add-additional-time-button').click();
  await page.getByTestId('add-additional-time-confirm-button').click();
  await expect(page.getByTestId('add-additional-time-confirm-button')).not.toBeVisible();
}
