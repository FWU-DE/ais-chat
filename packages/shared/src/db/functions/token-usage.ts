import { logError } from '@shared/logging';

import { db } from '..';
import {
  conversationUsageTracking,
  type ConversationUsageTrackingInsertModel,
  type ToolCallName,
} from '../schema';

/** Returns 0 for non-finite costs, since a single NaN row breaks the summed budget. */
export function sanitizeCostsInCent<T extends { costsInCent?: number }>(value: T): T {
  if (value.costsInCent === undefined || Number.isFinite(value.costsInCent)) return value;

  logError(
    'Invalid costsInCent, writing 0 instead',
    new TypeError(`Invalid costsInCent: ${value.costsInCent}`),
  );

  return { ...value, costsInCent: 0 };
}

export async function dbInsertConversationUsage(value: ConversationUsageTrackingInsertModel) {
  const [insertedUsage] = await db
    .insert(conversationUsageTracking)
    .values(sanitizeCostsInCent(value))
    .returning();

  if (insertedUsage === undefined) {
    throw new Error('Could not insert usage');
  }

  return insertedUsage;
}

export async function dbInsertConversationToolCallUsage({
  conversationId,
  userId,
  toolCallName,
  costsInCent,
}: {
  conversationId: string;
  userId: string;
  toolCallName: ToolCallName;
  costsInCent: number;
}) {
  return dbInsertConversationUsage({
    conversationId,
    userId,
    toolCallName,
    costsInCent,
    modelId: null,
    completionTokens: 0,
    promptTokens: 0,
  } satisfies ConversationUsageTrackingInsertModel);
}
