import { describe, expect, it } from 'vitest';

import type { LlmModelSelectModel } from '../db/schema';
import { getCostFactor } from './cost-factor';

const model = (completionTokenPrice: number): LlmModelSelectModel => ({
  id: String(completionTokenPrice),
  provider: 'test',
  name: 'test',
  displayName: 'test',
  description: '',
  priceMetadata: { type: 'text', completionTokenPrice, promptTokenPrice: 0 },
  createdAt: new Date(),
  supportedImageFormats: [],
  imageGenerationConfig: null,
  modelConfig: null,
  isNew: false,
  isDeleted: false,
  vendor: null,
  reasoning: null,
});

const imageModel = {
  ...model(0),
  priceMetadata: { type: 'image', pricePerImageInCent: 1 },
} as LlmModelSelectModel;

const defaultModel = model(100);

describe('getCostFactor', () => {
  it('is 1 for the default model', () => {
    expect(getCostFactor({ model: defaultModel, defaultModel })).toBe(1);
  });

  it.each([
    [50, 0.5],
    [110, 1.1],
    [125, 1.25],
    [4, 0.04],
    [2500, 25],
  ])('price %d gives the unrounded factor %d', (price, factor) => {
    expect(getCostFactor({ model: model(price), defaultModel })).toBeCloseTo(factor);
  });

  it('falls back to 0 for a price of 0', () => {
    expect(getCostFactor({ model: model(0), defaultModel })).toBe(0);
    expect(getCostFactor({ model: model(0), defaultModel: model(0) })).toBe(0);
  });

  it('falls back to 0 when the default price is 0 or the default model is missing', () => {
    expect(getCostFactor({ model: model(100), defaultModel: model(0) })).toBe(0);
    expect(getCostFactor({ model: model(100), defaultModel: undefined })).toBe(0);
  });

  it('falls back to 0 for models without a text price', () => {
    expect(getCostFactor({ model: imageModel, defaultModel })).toBe(0);
    expect(getCostFactor({ model: model(100), defaultModel: imageModel })).toBe(0);
  });
});
