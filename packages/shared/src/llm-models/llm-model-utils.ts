import type { LlmModelSelectModel } from '../db/schema';

export function getFirstTextModel<T extends LlmModelSelectModel>(models: T[]): T | undefined {
  return models.find(
    (model) => model.priceMetadata.type === 'text' && !model.name.toLowerCase().includes('mistral'),
  );
}

export function getFilteredTextModels<T extends LlmModelSelectModel>(
  models: T[],
  excludeMistral: boolean = false,
): T[] {
  const textModels = models.filter((model) => model.priceMetadata.type === 'text');

  return excludeMistral
    ? textModels.filter((model) => !model.name.toLowerCase().includes('mistral'))
    : textModels;
}
