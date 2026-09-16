import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmModelSelectModel } from '../db/schema';

const { dbFindModelByIdAndFederalStateId, dbGetLlmModelById, dbGetConfiguration } = vi.hoisted(
  () => ({
    dbFindModelByIdAndFederalStateId: vi.fn(),
    dbGetLlmModelById: vi.fn(),
    dbGetConfiguration: vi.fn(),
  }),
);

vi.mock('@shared/db/functions/llm-model', () => ({
  dbFindModelByIdAndFederalStateId,
  dbGetLlmModelById,
  dbGetAllLlmModels: vi.fn(),
  dbGetModelByName: vi.fn(),
}));

vi.mock('@shared/db/functions/configuration', () => ({
  dbGetConfiguration,
  dbUpsertConfiguration: vi.fn(),
}));

import { getDefaultModel, getSafetyModel } from './llm-model-service';

const textModel = (id: string, name: string): LlmModelSelectModel => ({
  id,
  provider: 'test',
  name,
  displayName: name,
  description: '',
  priceMetadata: {
    type: 'text',
    completionTokenPrice: 0,
    promptTokenPrice: 0,
  },
  createdAt: new Date(),
  supportedImageFormats: [],
  imageGenerationConfig: null,
  isNew: false,
  isDeleted: false,
});

describe('getDefaultModel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dbGetConfiguration.mockResolvedValue({
      key: 'static_models',
      value: {
        'default-chat': '11111111-1111-4111-8111-111111111111',
        fallback: '22222222-2222-4222-8222-222222222222',
        auxiliary: '33333333-3333-4333-8333-333333333333',
        'strong-auxiliary': '44444444-4444-4444-8444-444444444444',
        'auxiliary-fallback': '55555555-5555-4555-8555-555555555555',
        'default-image': '66666666-6666-4666-8666-666666666666',
        safety: '77777777-7777-4777-8777-777777777777',
      },
    });
  });

  it('returns the configured default model when it is available to the federal state', async () => {
    const configuredModel = textModel('11111111-1111-4111-8111-111111111111', 'configured-model');
    dbFindModelByIdAndFederalStateId.mockResolvedValue(configuredModel);

    await expect(
      getDefaultModel({
        federalStateId: 'DE-BY',
        models: [textModel('fallback', 'fallback-model')],
      }),
    ).resolves.toBe(configuredModel);
  });

  it('falls back to the first non-Mistral text model when the configured model is unavailable', async () => {
    dbFindModelByIdAndFederalStateId.mockResolvedValue(undefined);
    const fallbackModel = textModel('fallback', 'fallback-model');

    await expect(
      getDefaultModel({
        federalStateId: 'DE-BY',
        models: [textModel('mistral', 'mistral-small'), fallbackModel],
      }),
    ).resolves.toBe(fallbackModel);
  });

  it('returns undefined when no compatible text model is available', async () => {
    dbFindModelByIdAndFederalStateId.mockResolvedValue(undefined);

    await expect(getDefaultModel({ federalStateId: 'DE-BY', models: [] })).resolves.toBeUndefined();
  });
});

describe('getSafetyModel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    dbGetConfiguration.mockResolvedValue({
      key: 'static_models',
      value: {
        'default-chat': '11111111-1111-4111-8111-111111111111',
        fallback: '22222222-2222-4222-8222-222222222222',
        auxiliary: '33333333-3333-4333-8333-333333333333',
        'strong-auxiliary': '44444444-4444-4444-8444-444444444444',
        'auxiliary-fallback': '55555555-5555-4555-8555-555555555555',
        'default-image': '66666666-6666-4666-8666-666666666666',
        safety: '77777777-7777-4777-8777-777777777777',
      },
    });
  });

  it('returns the globally configured safety model', async () => {
    const safetyModel = textModel('safety', 'safety-model');
    safetyModel.priceMetadata = { type: 'safety', promptTokenPrice: 0 };
    dbGetLlmModelById.mockResolvedValue(safetyModel);

    await expect(getSafetyModel()).resolves.toBe(safetyModel);
  });

  it('returns undefined when no safety model is available', async () => {
    dbGetLlmModelById.mockResolvedValue(undefined);

    await expect(getSafetyModel()).resolves.toBeUndefined();
  });
});
