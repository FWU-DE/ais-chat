import { CUSTOM_OPENAI_PROVIDER_SUFFIX, PRICE_AND_CENT_MULTIPLIER } from './const';

export function isCustomOpenAiProviderId(id: string): boolean {
  return id.endsWith(CUSTOM_OPENAI_PROVIDER_SUFFIX);
}

/**
 * Translates a provider id as reported by Bifrost into the provider name used by
 * `llm_provider_key.provider`.
 */
export function normalizeBifrostProviderName(provider: string): string {
  if (provider === 'vertex') return 'google';
  if (isCustomOpenAiProviderId(provider)) return 'openai';
  return provider;
}

export function calculatePriceInCentByTextModelAndUsage({
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

export function calculatePriceInCentByEmbeddingModelAndUsage({
  promptTokens,
  priceMetadata,
}: {
  priceMetadata: { promptTokenPrice: number };
  promptTokens: number;
}) {
  const promptTokenPrice = promptTokens * priceMetadata.promptTokenPrice;
  return promptTokenPrice / PRICE_AND_CENT_MULTIPLIER;
}
