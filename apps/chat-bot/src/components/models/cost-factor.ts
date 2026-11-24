import type { LlmModelSelectModel } from '@shared/db/schema';

function getCompletionTokenPrice(model: LlmModelSelectModel | undefined): number {
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
  model: LlmModelSelectModel;
  defaultModel: LlmModelSelectModel | undefined;
}): number {
  const price = getCompletionTokenPrice(model);
  const defaultPrice = getCompletionTokenPrice(defaultModel);
  if (price <= 0 || defaultPrice <= 0) return 0;

  return price / defaultPrice;
}
