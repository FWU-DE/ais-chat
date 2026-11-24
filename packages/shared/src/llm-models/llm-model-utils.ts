import type { LlmModelSelectModel } from '../db/schema';

export function getFirstTextModel<T extends LlmModelSelectModel>(models: T[]): T | undefined {
  return models.find((model) => model.priceMetadata.type === 'text');
}

export function getTextModels<T extends LlmModelSelectModel>(models: T[]): T[] {
  return models.filter((model) => model.priceMetadata.type === 'text');
}
