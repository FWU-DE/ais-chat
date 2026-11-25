import type { LlmModelSelectModel } from '@shared/db/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbGetLlmModelsByFederalStateIdMock: vi.fn(),
  getDefaultModelMock: vi.fn(),
  logErrorMock: vi.fn(),
}));

vi.mock('@shared/db/functions/llm-model', () => ({
  dbGetLlmModelsByFederalStateId: mocks.dbGetLlmModelsByFederalStateIdMock,
}));

vi.mock('@shared/llm-models/llm-model-service', () => ({
  getDefaultModel: mocks.getDefaultModelMock,
}));

vi.mock('@shared/logging', () => ({
  logError: mocks.logErrorMock,
}));

const baseModel: LlmModelSelectModel = {
  id: 'model-1',
  provider: 'test',
  name: 'test-model',
  displayName: 'Test Model',
  description: 'Good for everything',
  priceMetadata: { type: 'text', completionTokenPrice: 100, promptTokenPrice: 10 },
  createdAt: new Date(),
  supportedImageFormats: [],
  imageGenerationConfig: null,
  modelConfig: null,
  isNew: false,
  isDeleted: false,
  vendor: null,
  reasoning: null,
};

const textModel = (overrides: Partial<LlmModelSelectModel> = {}): LlmModelSelectModel => ({
  ...baseModel,
  ...overrides,
});

const imageModel = (overrides: Partial<LlmModelSelectModel> = {}): LlmModelSelectModel =>
  textModel({
    id: 'image-1',
    priceMetadata: { type: 'image', pricePerImageInCent: 5 },
    ...overrides,
  });

const modelOfType = (type: 'speech' | 'embedding' | 'safety'): LlmModelSelectModel => {
  const priceMetadata =
    type === 'speech'
      ? ({ type, priceInCentPer1MillionCharacters: 1 } as const)
      : ({ type, promptTokenPrice: 1 } as const);
  return textModel({ id: type, priceMetadata });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toAgentModelSummaries', () => {
  it('maps text and image models and skips all other types', async () => {
    const { toAgentModelSummaries } = await import('./list-models-tool');
    const defaultModel = textModel({
      vendor: 'Acme',
      isNew: true,
      reasoning: { effort: 'high' },
      supportedImageFormats: ['jpg', 'png', 'webp'],
      priceMetadata: { type: 'text', completionTokenPrice: 200, promptTokenPrice: 0 },
    });
    const cheap = textModel({
      id: 'cheap',
      displayName: 'Cheap',
      priceMetadata: { type: 'text', completionTokenPrice: 100, promptTokenPrice: 0 },
    });
    const image = imageModel({ supportedImageFormats: ['jpg', 'jpeg', 'png'] });

    const result = toAgentModelSummaries({
      models: [
        modelOfType('speech'),
        defaultModel,
        modelOfType('embedding'),
        cheap,
        modelOfType('safety'),
        image,
      ],
      defaultModel,
    });

    expect(result).toEqual([
      {
        id: 'model-1',
        displayName: 'Test Model',
        description: 'Good for everything',
        vendor: 'Acme',
        type: 'text',
        reasoningEffort: 'high',
        costFactor: 1,
        supportedImageFormats: ['jpg', 'png', 'webp'],
        isNew: true,
        isDefault: true,
      },
      {
        id: 'cheap',
        displayName: 'Cheap',
        description: 'Good for everything',
        vendor: null,
        type: 'text',
        reasoningEffort: null,
        costFactor: 0.5,
        supportedImageFormats: [],
        isNew: false,
        isDefault: false,
      },
      {
        id: 'image-1',
        displayName: 'Test Model',
        description: 'Good for everything',
        vendor: null,
        type: 'image',
        reasoningEffort: null,
        costFactor: null,
        supportedImageFormats: ['jpg', 'jpeg', 'png'],
        isNew: false,
        isDefault: false,
      },
    ]);
  });

  it('falls back for missing reasoning effort and stored image formats', async () => {
    const { toAgentModelSummaries } = await import('./list-models-tool');
    const models = [
      textModel({ id: 'a', reasoning: null, supportedImageFormats: null as unknown as string[] }),
      textModel({ id: 'b', reasoning: { summary: 'auto' }, supportedImageFormats: [] }),
    ];

    const result = toAgentModelSummaries({ models, defaultModel: models[0] });

    expect(
      result.map(({ reasoningEffort, supportedImageFormats }) => [
        reasoningEffort,
        supportedImageFormats,
      ]),
    ).toEqual([
      [null, []],
      [null, []],
    ]);
  });

  it('does not expose provider settings', async () => {
    const { toAgentModelSummaries } = await import('./list-models-tool');
    const model = {
      ...textModel(),
      setting: { apiKey: 'secret' },
    } as LlmModelSelectModel;

    const result = toAgentModelSummaries({ models: [model], defaultModel: model });

    expect(JSON.stringify(result)).not.toContain('secret');
  });
});

describe('buildListModelsTool', () => {
  it('returns the mapped models of the federal state', async () => {
    const text = textModel();
    const speech = modelOfType('speech');
    mocks.dbGetLlmModelsByFederalStateIdMock.mockResolvedValue([text, speech]);
    mocks.getDefaultModelMock.mockResolvedValue(text);
    const { buildListModelsTool, toAgentModelSummaries } = await import('./list-models-tool');

    const result = await buildListModelsTool({ federalStateId: 'fs-1' }).handler({});

    expect(mocks.dbGetLlmModelsByFederalStateIdMock).toHaveBeenCalledWith({
      federalStateId: 'fs-1',
    });
    expect(mocks.getDefaultModelMock).toHaveBeenCalledWith({
      federalStateId: 'fs-1',
      models: [text, speech],
    });
    expect(result).toEqual({
      models: toAgentModelSummaries({ models: [text], defaultModel: text }),
    });
  });

  it('returns a generic error when loading the models fails', async () => {
    mocks.dbGetLlmModelsByFederalStateIdMock.mockRejectedValue(new Error('Database error'));
    const { buildListModelsTool } = await import('./list-models-tool');

    const result = await buildListModelsTool({ federalStateId: 'fs-1' }).handler({});

    expect(result).toEqual({ error: 'Models could not be loaded.' });
    expect(mocks.logErrorMock).toHaveBeenCalled();
  });
});

describe('listModelsActivity', () => {
  it('creates a tool step without detail', async () => {
    const { listModelsActivity } = await import('./list-models-tool');

    expect(
      listModelsActivity.createStep({ id: 'call-1', name: 'list_models', arguments: '{}' }),
    ).toEqual({ kind: 'tool', id: 'call-1', tool: 'list_models' });
  });

  it('parses persisted success and error results', async () => {
    const { listModelsActivity } = await import('./list-models-tool');

    expect(listModelsActivity.parsePersistedResult({ models: [] })).toEqual({ models: [] });
    expect(listModelsActivity.parsePersistedResult({ error: 'failed' })).toEqual({
      error: 'failed',
    });
    expect(listModelsActivity.parsePersistedResult(null)).toBeUndefined();
  });
});
