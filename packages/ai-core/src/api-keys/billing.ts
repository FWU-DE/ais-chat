import {
  dbCreateImageGenerationUsage,
  dbCreateCompletionUsage,
  dbGetApiKeyLimit,
  dbGetCompletionUsageCostsSinceStartOfCurrentMonth,
  dbGetImageGenerationUsageCostsSinceStartOfCurrentMonth,
} from '@ais-chat/api-database';
import { AiModel, Usage } from '../images/types';
import type { AiModel as TextAiModel, TokenUsage } from '../chat/types';

const TOKEN_AMOUNT_PER_PRICE = 1_000_000;
const CENT_MULTIPLIER = 10;
// TODO: Why are we saving Model prices in tenths of a cent?
const PRICE_AND_CENT_MULTIPLIER = TOKEN_AMOUNT_PER_PRICE * CENT_MULTIPLIER;

function calculatePriceInCentByTextModelAndUsage({
  completionTokens,
  promptTokens,
  priceMetadata,
}: {
  priceMetadata: { completionTokenPrice: number; promptTokenPrice: number };
  completionTokens: number;
  promptTokens: number;
}) {
  const completionTokenPrice = completionTokens * priceMetadata.completionTokenPrice;
  const promptTokenPrice = promptTokens * priceMetadata.promptTokenPrice;

  return (completionTokenPrice + promptTokenPrice) / PRICE_AND_CENT_MULTIPLIER;
}

function calculatePriceInCentByImageModelAndUsage({
  usage,
  priceMetadata,
}: {
  priceMetadata: {
    inputTextTokenPrice: number;
    inputImageTokenPrice: number;
    outputTextTokenPrice: number;
    outputImageTokenPrice: number;
  };
  usage: Usage;
}) {
  // These prices are in cent per 1 million tokens
  // Newer models include "image tokens" in their price metadata, which we calculate by multiplying the number of input/output image tokens with the input/outputImageTokenPrice.
  const inputTextTokenPrice = usage.input_text_tokens * priceMetadata.inputTextTokenPrice;
  const inputImageTokenPrice = usage.input_image_tokens * priceMetadata.inputImageTokenPrice;
  const outputTextTokenPrice = (usage.output_text_tokens ?? 0) * priceMetadata.outputTextTokenPrice;
  const outputImageTokenPrice = usage.output_image_tokens * priceMetadata.outputImageTokenPrice;

  return (
    (inputTextTokenPrice + inputImageTokenPrice + outputTextTokenPrice + outputImageTokenPrice) /
    TOKEN_AMOUNT_PER_PRICE
  );
}

// TODO: Re-enable when embedding billing is implemented
// function calculatePriceInCentByEmbeddingModelAndUsage({
//   promptTokens,
//   priceMetadata,
// }: {
//   priceMetadata: { promptTokenPrice: number };
//   promptTokens: number;
// }) {
//   const promptTokenPrice = promptTokens * priceMetadata.promptTokenPrice;
//   return promptTokenPrice / PRICE_AND_CENT_MULTIPLIER;
// }

/**
 * Bills image generation usage to the specified API key.
 *
 * This function records and charges the cost of image generation
 * against the quota or billing account associated with the given API key.
 *
 * @param apiKeyId - The unique identifier of the API key to bill
 * @param imageModel - The image model used for generation
 * @param usage - Usage information for the image generation
 * @returns A promise that includes the price in cents charged for the operation
 */
export async function billImageGenerationUsageToApiKey(
  apiKeyId: string,
  imageModel: AiModel,
  usage?: Usage,
): Promise<number> {
  if (imageModel.priceMetadata.type !== 'image') {
    throw new Error(`Model ${imageModel.displayName} is not an image model`);
  }
  let priceInCent: number;
  if (!usage) {
    if (!('pricePerImageInCent' in imageModel.priceMetadata)) {
      throw new Error(
        `Model ${imageModel.displayName} pricing metadata does not support per-image billing`,
      );
    }
    priceInCent = imageModel.priceMetadata.pricePerImageInCent;
  } else {
    if (!('inputTextTokenPrice' in imageModel.priceMetadata)) {
      throw new Error(
        `Model ${imageModel.displayName} pricing metadata does not support token-based billing`,
      );
    }
    priceInCent = calculatePriceInCentByImageModelAndUsage({
      usage,
      priceMetadata: imageModel.priceMetadata,
    });
  }
  await dbCreateImageGenerationUsage({
    apiKeyId,
    modelId: imageModel.id,
    costsInCent: priceInCent,
  });
  return priceInCent;
}
/**
 * Bills text generation usage to the specified API key.
 *
 * This function records and charges the cost of text generation
 * against the quota or billing account associated with the given API key.
 *
 * @param apiKeyId - The unique identifier of the API key to bill
 * @param textModel - The text model used for generation
 * @param usage - Token usage information
 * @returns A promise that includes the price in cents charged for the operation
 */
export async function billTextGenerationUsageToApiKey(
  apiKeyId: string,
  textModel: TextAiModel,
  usage: TokenUsage,
): Promise<number> {
  if (textModel.priceMetadata.type !== 'text') {
    throw new Error(`Model ${textModel.id} is not a text model`);
  }
  const priceInCent = calculatePriceInCentByTextModelAndUsage({
    completionTokens: usage.completionTokens,
    promptTokens: usage.promptTokens,
    priceMetadata: textModel.priceMetadata,
  });

  await dbCreateCompletionUsage({
    apiKeyId,
    modelId: textModel.id,
    completionTokens: usage.completionTokens,
    promptTokens: usage.promptTokens,
    totalTokens: usage.totalTokens,
    costsInCent: priceInCent,
  });
  return priceInCent;
}

export async function isApiKeyOverQuota(apiKeyId: string): Promise<boolean> {
  // Get the API key limit and sum usage costs since the start of the month
  const [apiKeyData, completionCosts, imageCosts] = await Promise.all([
    dbGetApiKeyLimit(apiKeyId),
    dbGetCompletionUsageCostsSinceStartOfCurrentMonth({ apiKeyId }),
    dbGetImageGenerationUsageCostsSinceStartOfCurrentMonth({ apiKeyId }),
  ]);

  if (!apiKeyData) {
    throw new Error(`API key not found: ${apiKeyId}`);
  }

  const { limitInCent } = apiKeyData;

  // Calculate total usage
  const totalUsage = completionCosts + imageCosts;

  // Return true if usage exceeds the limit
  return totalUsage > limitInCent;
}
