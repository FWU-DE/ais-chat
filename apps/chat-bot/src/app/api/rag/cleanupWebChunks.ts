import { db } from '@shared/db';
import { chunkTable } from '@shared/db/schema';
import { addDays } from '@shared/utils/date';
import { and, eq, lt } from 'drizzle-orm';

/**
 * Cleans up web chunks older than 30 days from the database.
 * Attention: This is an admin function that does not check any authorization!
 *
 * @returns number of deleted web chunks in db
 */
export async function cleanupWebChunks() {
  const cutoffDate = addDays(new Date(), -30);

  const result = await db
    .delete(chunkTable)
    .where(and(eq(chunkTable.sourceType, 'webpage'), lt(chunkTable.createdAt, cutoffDate)));

  return result.rowCount ?? 0;
}
