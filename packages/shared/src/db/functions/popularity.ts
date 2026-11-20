import { chunkArray } from '@shared/utils/arrays';
import { addDays } from '@shared/utils/date';
import { count, eq, gte, inArray, sum } from 'drizzle-orm';

import { db } from '..';
import {
  assistantTable,
  characterTable,
  conversationTable,
  conversationUsageTracking,
  learningScenarioTable,
  sharedCharacterChatUsageTrackingTable,
  sharedLearningScenarioUsageTracking,
} from '../schema';

export const USAGE_WINDOW_DAYS = 60;
// Stays well below the 65,535 bind parameters of a Postgres statement.
const MAX_IDS_PER_UPDATE = 10_000;

type PopularityTable = typeof assistantTable | typeof characterTable | typeof learningScenarioTable;
type UsageByEntityId = Map<string, number>;

export type RefreshPopularityCounts = {
  assistantsUpdated: number;
  charactersUpdated: number;
  learningScenariosUpdated: number;
};

/**
 * Writes the usage within `USAGE_WINDOW_DAYS` to the `popularity` column of assistants,
 * characters and learning scenarios. Only rows whose value changed are written, `updated_at` is
 * preserved.
 */
export async function dbRefreshEntityPopularity(): Promise<RefreshPopularityCounts> {
  const usage = await getUsageByEntityId();
  return {
    assistantsUpdated: await updatePopularity(assistantTable, usage.assistants),
    charactersUpdated: await updatePopularity(characterTable, usage.characters),
    learningScenariosUpdated: await updatePopularity(
      learningScenarioTable,
      usage.learningScenarios,
    ),
  };
}

async function getUsageByEntityId() {
  const windowStart = addDays(new Date(), -USAGE_WINDOW_DAYS);

  // Count usage rows per conversation first, so only the aggregated rows are joined to `conversation`.
  const usagePerConversation = db
    .select({
      conversationId: conversationUsageTracking.conversationId,
      usageCount: count().as('usage_count'),
    })
    .from(conversationUsageTracking)
    .where(gte(conversationUsageTracking.createdAt, windowStart))
    .groupBy(conversationUsageTracking.conversationId)
    .as('usage_per_conversation');

  const conversationUsage = await db
    .select({
      assistantId: conversationTable.assistantId,
      characterId: conversationTable.characterId,
      learningScenarioId: conversationTable.learningScenarioId,
      usageCount: sum(usagePerConversation.usageCount).mapWith(Number),
    })
    .from(usagePerConversation)
    .innerJoin(conversationTable, eq(conversationTable.id, usagePerConversation.conversationId))
    .groupBy(
      conversationTable.assistantId,
      conversationTable.characterId,
      conversationTable.learningScenarioId,
    );

  const sharedCharacterUsage = await db
    .select({ id: sharedCharacterChatUsageTrackingTable.characterId, usageCount: count() })
    .from(sharedCharacterChatUsageTrackingTable)
    .where(gte(sharedCharacterChatUsageTrackingTable.createdAt, windowStart))
    .groupBy(sharedCharacterChatUsageTrackingTable.characterId);

  const sharedLearningScenarioUsage = await db
    .select({ id: sharedLearningScenarioUsageTracking.learningScenarioId, usageCount: count() })
    .from(sharedLearningScenarioUsageTracking)
    .where(gte(sharedLearningScenarioUsageTracking.createdAt, windowStart))
    .groupBy(sharedLearningScenarioUsageTracking.learningScenarioId);

  const assistants: UsageByEntityId = new Map();
  const characters: UsageByEntityId = new Map();
  const learningScenarios: UsageByEntityId = new Map();
  const addUsage = (
    usageByEntityId: UsageByEntityId,
    entityId: string | null,
    usageCount: number,
  ) => {
    if (entityId === null) return;
    usageByEntityId.set(entityId, (usageByEntityId.get(entityId) ?? 0) + usageCount);
  };

  for (const row of conversationUsage) {
    addUsage(assistants, row.assistantId, row.usageCount);
    addUsage(characters, row.characterId, row.usageCount);
    addUsage(learningScenarios, row.learningScenarioId, row.usageCount);
  }
  for (const row of sharedCharacterUsage) {
    addUsage(characters, row.id, row.usageCount);
  }
  for (const row of sharedLearningScenarioUsage) {
    addUsage(learningScenarios, row.id, row.usageCount);
  }

  return { assistants, characters, learningScenarios };
}

/**
 * Updates the rows whose stored value differs from the usage, because Postgres writes a new row
 * version even if the value is the same. Entities without usage in the window are reset to 0,
 * usage of deleted entities (hard- and soft-deleted) is ignored. `updated_at` is set explicitly, otherwise Drizzle would
 * reset it for every updated row.
 */
async function updatePopularity(table: PopularityTable, usage: UsageByEntityId): Promise<number> {
  const stored = await db
    .select({ id: table.id, popularity: table.popularity })
    .from(table)
    .where(eq(table.isDeleted, false));

  const idsByPopularity = new Map<number, string[]>();
  for (const { id, popularity } of stored) {
    const target = usage.get(id) ?? 0;
    if (target !== popularity) {
      const ids = idsByPopularity.get(target) ?? [];
      ids.push(id);
      idsByPopularity.set(target, ids);
    }
  }

  let updated = 0;
  for (const [popularity, ids] of idsByPopularity) {
    for (const idChunk of chunkArray(ids, MAX_IDS_PER_UPDATE)) {
      const result = await db
        .update(table)
        .set({ popularity, updatedAt: table.updatedAt })
        .where(inArray(table.id, idChunk))
        .returning({ id: table.id });
      updated += result.length;
    }
  }
  return updated;
}
