import { and, between, eq, sum } from 'drizzle-orm';

import { getEndOfCurrentMonth, getStartOfCurrentMonth } from '../../utils/date';
import { db } from '..';
import {
  conversationUsageTracking,
  sharedCharacterChatUsageTrackingTable,
  sharedLearningScenarioUsageTracking,
} from '../schema';

export async function dbGetLearningScenarioUsageInCentByUserId({ userId }: { userId: string }) {
  const startDate = getStartOfCurrentMonth();
  const endDate = getEndOfCurrentMonth();

  const costs = await db
    .select({ totalCosts: sum(sharedLearningScenarioUsageTracking.costsInCent) })
    .from(sharedLearningScenarioUsageTracking)
    .where(
      and(
        eq(sharedLearningScenarioUsageTracking.userId, userId),
        between(sharedLearningScenarioUsageTracking.createdAt, startDate, endDate),
      ),
    );

  return Number(costs[0]?.totalCosts || 0);
}

export async function dbGetCharacterSharedChatsUsageInCentByUserId({ userId }: { userId: string }) {
  const startDate = getStartOfCurrentMonth();
  const endDate = getEndOfCurrentMonth();

  const costs = await db
    .select({ totalCosts: sum(sharedCharacterChatUsageTrackingTable.costsInCent) })
    .from(sharedCharacterChatUsageTrackingTable)
    .where(
      and(
        eq(sharedCharacterChatUsageTrackingTable.userId, userId),
        between(sharedCharacterChatUsageTrackingTable.createdAt, startDate, endDate),
      ),
    );

  return Number(costs[0]?.totalCosts || 0);
}

export async function dbGetChatsUsageInCentByUserId({ userId }: { userId: string }) {
  const startDate = getStartOfCurrentMonth();
  const endDate = getEndOfCurrentMonth();

  const costs = await db
    .select({ totalCosts: sum(conversationUsageTracking.costsInCent) })
    .from(conversationUsageTracking)
    .where(
      and(
        eq(conversationUsageTracking.userId, userId),
        between(conversationUsageTracking.createdAt, startDate, endDate),
      ),
    );

  return Number(costs[0]?.totalCosts || 0);
}

export async function dbGetLearningScenarioChatUsageInCentByLearningScenarioId({
  learningScenarioId,
  userId,
  startedAt,
  expiredAt,
}: {
  learningScenarioId: string;
  userId: string;
  startedAt: Date;
  expiredAt: Date;
}) {
  const costs = await db
    .select({ totalCosts: sum(sharedLearningScenarioUsageTracking.costsInCent) })
    .from(sharedLearningScenarioUsageTracking)
    .where(
      and(
        eq(sharedLearningScenarioUsageTracking.learningScenarioId, learningScenarioId),
        eq(sharedLearningScenarioUsageTracking.userId, userId),
        between(sharedLearningScenarioUsageTracking.createdAt, startedAt, expiredAt),
      ),
    );

  return Number(costs[0]?.totalCosts || 0);
}

export async function dbGetSharedCharacterChatUsageInCentByCharacterId({
  characterId,
  userId,
  startedAt,
  expiredAt,
}: {
  characterId: string;
  userId: string;
  startedAt: Date;
  expiredAt: Date;
}) {
  const costs = await db
    .select({ totalCosts: sum(sharedCharacterChatUsageTrackingTable.costsInCent) })
    .from(sharedCharacterChatUsageTrackingTable)
    .where(
      and(
        eq(sharedCharacterChatUsageTrackingTable.characterId, characterId),
        eq(sharedCharacterChatUsageTrackingTable.userId, userId),
        between(sharedCharacterChatUsageTrackingTable.createdAt, startedAt, expiredAt),
      ),
    );

  return Number(costs[0]?.totalCosts || 0);
}
