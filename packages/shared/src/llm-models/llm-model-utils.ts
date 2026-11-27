import type { LlmModel } from '@ais-chat/api-database';

export function getFirstTextModel<T extends LlmModel>(models: T[]): T | undefined {
  return models.find((model) => model.priceMetadata.type === 'text');
}

export function getTextModels<T extends LlmModel>(models: T[]): T[] {
  return models.filter((model) => model.priceMetadata.type === 'text');
}
