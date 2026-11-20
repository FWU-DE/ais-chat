import { and, eq, gte, sum } from 'drizzle-orm';

import { getStartOfCurrentMonth } from '../api-utils';
import { db } from '../db';
import {
  ImageGenerationUsageInsertModel,
  imageGenerationUsageTrackingTable,
  llmModelTable,
} from '../schema';

export async function dbCreateImageGenerationUsage(
  imageGenerationUsage: ImageGenerationUsageInsertModel,
) {
  // Get the model to calculate costs
  const model = await db
    .select()
    .from(llmModelTable)
    .where(eq(llmModelTable.id, imageGenerationUsage.modelId))
    .limit(1);

  if (model.length === 0) {
    throw new Error(`Model not found: ${imageGenerationUsage.modelId}`);
  }

  const modelData = model[0]!;
  let costsInCent = 0;

  // Calculate costs based on model price metadata
  if (modelData.priceMetadata.type === 'image' && imageGenerationUsage.costsInCent) {
    costsInCent = imageGenerationUsage.costsInCent;
  }

  const insertedImageGenerationUsage = (
    await db
      .insert(imageGenerationUsageTrackingTable)
      .values({
        ...imageGenerationUsage,
        costsInCent,
      })
      .returning()
  )[0];

  return insertedImageGenerationUsage;
}

export async function dbGetImageGenerationUsageCostsSinceStartOfCurrentMonth({
  apiKeyId,
}: {
  apiKeyId: string;
}) {
  const startOfMonth = getStartOfCurrentMonth();

  const imageUsage = await db
    .select({ total: sum(imageGenerationUsageTrackingTable.costsInCent) })
    .from(imageGenerationUsageTrackingTable)
    .where(
      and(
        eq(imageGenerationUsageTrackingTable.apiKeyId, apiKeyId),
        gte(imageGenerationUsageTrackingTable.createdAt, startOfMonth),
      ),
    );

  return Number(imageUsage[0]?.total || 0);
}
