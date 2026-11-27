import type { LlmModel } from '@ais-chat/api-database';

function getCompletionTokenPrice(model: LlmModel | undefined): number {
  return model?.priceMetadata.type === 'text' ? model.priceMetadata.completionTokenPrice : 0;
}

/**
 * Completion token price of a model relative to the default model.
 * A missing or zero price on either side yields 0 instead of failing.
 */
export function getCostFactor({
  model,
  defaultModel,
}: {
  model: LlmModel;
  defaultModel: LlmModel | undefined;
}): number {
  const price = getCompletionTokenPrice(model);
  const defaultPrice = getCompletionTokenPrice(defaultModel);
  if (price <= 0 || defaultPrice <= 0) return 0;

  return price / defaultPrice;
}

const MIN_DISPLAY_FACTOR = 0.1;

/** Rounds to one decimal; a paid model never shows less than 0.1x. */
export function roundCostFactor(factor: number): number {
  return factor > 0 ? Math.max(MIN_DISPLAY_FACTOR, Math.round(factor * 10) / 10) : 0;
}
