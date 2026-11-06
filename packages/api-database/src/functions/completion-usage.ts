import { and, eq, gte, sum } from 'drizzle-orm';

import { getStartOfCurrentMonth } from '../api-utils';
import { db } from '../db';
import {
  calculatePriceInCentByEmbeddingModelAndUsage,
  calculatePriceInCentByTextModelAndUsage,
} from '../llm-model';
import { CompletionUsageInsertModel, completionUsageTrackingTable, llmModelTable } from '../schema';

export async function dbCreateCompletionUsage(completionUsage: CompletionUsageInsertModel) {
  // Get the model to calculate costs
  const model = await db
    .select()
    .from(llmModelTable)
    .where(eq(llmModelTable.id, completionUsage.modelId))
    .limit(1);

  if (model.length === 0) {
    throw new Error(`Model not found: ${completionUsage.modelId}`);
  }

  const modelData = model[0]!;
  let costsInCent = 0;

  // Calculate costs based on model price metadata
  if (modelData.priceMetadata.type === 'text') {
    costsInCent = calculatePriceInCentByTextModelAndUsage({
      priceMetadata: modelData.priceMetadata,
      promptTokens: completionUsage.promptTokens,
      completionTokens: completionUsage.completionTokens,
    });
  } else if (modelData.priceMetadata.type === 'embedding') {
    costsInCent = calculatePriceInCentByEmbeddingModelAndUsage({
      priceMetadata: modelData.priceMetadata,
      promptTokens: completionUsage.promptTokens,
    });
  }

  const insertedCompletionUsage = (
    await db
      .insert(completionUsageTrackingTable)
      .values({
        ...completionUsage,
        costsInCent,
      })
      .returning()
  )[0];

  return insertedCompletionUsage;
}

export async function dbGetCompletionUsageCostsSinceStartOfCurrentMonth({
  apiKeyId,
}: {
  apiKeyId: string;
}) {
  const startOfMonth = getStartOfCurrentMonth();

  const completionUsage = await db
    .select({ total: sum(completionUsageTrackingTable.costsInCent) })
    .from(completionUsageTrackingTable)
    .where(
      and(
        eq(completionUsageTrackingTable.apiKeyId, apiKeyId),
        gte(completionUsageTrackingTable.createdAt, startOfMonth),
      ),
    );

  return Number(completionUsage[0]?.total || 0);
}
