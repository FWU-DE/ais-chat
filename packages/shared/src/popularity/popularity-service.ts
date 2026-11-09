import { dbRefreshEntityPopularity } from '@shared/db/functions/popularity';
import { logInfo } from '@shared/logging';

export type RefreshEntityPopularityResult = {
  assistantsUpdated: number;
  charactersUpdated: number;
  learningScenariosUpdated: number;
  durationMs: number;
};

/**
 * Recomputes the popularity of all assistants, characters and learning scenarios and stores it in
 * their `popularity` column. Only changed values are written.
 *
 * CAUTION: This is an admin function that does not check any authorization!
 */
export async function refreshEntityPopularity(): Promise<RefreshEntityPopularityResult> {
  const start = Date.now();
  const counts = await dbRefreshEntityPopularity();
  const durationMs = Date.now() - start;

  logInfo('Entity popularity refreshed', { ...counts, durationMs });
  return { ...counts, durationMs };
}
