import { beforeEach, describe, expect, it, vi } from 'vitest';
import { constructBifrostEmbeddingGenerationFn } from './bifrost';
import type { AiModel } from '../types';

const { createMock, openAiConstructorMock, instrumentOpenAiClientMock, MockOpenAI } = vi.hoisted(
  () => {
    const createMock = vi.fn();
    const openAiConstructorMock = vi.fn();

    class MockOpenAI {
      embeddings = { create: createMock };

      constructor(options: unknown) {
        openAiConstructorMock(options);
      }
    }

    const instrumentOpenAiClientMock = vi.fn((client) => client);

    return { createMock, openAiConstructorMock, instrumentOpenAiClientMock, MockOpenAI };
  },
);

vi.mock('openai', () => ({ default: MockOpenAI }));

vi.mock('@sentry/core', () => ({ instrumentOpenAiClient: instrumentOpenAiClientMock }));

vi.mock('../../env', () => ({
  env: {
    bifrostApiKey: 'bifrost-api-key',
    bifrostBaseUrl: 'http://localhost:8089/openai/v1',
  },
}));

describe('constructBifrostEmbeddingGenerationFn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates embeddings through the Bifrost compatible surface', async () => {
    createMock.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
      usage: { prompt_tokens: 4, total_tokens: 5 },
    });

    const model = {
      id: 'model-bifrost-embedding',
      name: 'embedding-model',
      provider: 'bifrost',
      setting: { provider: 'openai', apiKey: 'unused', baseUrl: 'unused' },
    } as AiModel;

    const generateEmbeddings = constructBifrostEmbeddingGenerationFn(model);
    const result = await generateEmbeddings({ texts: ['hello'], model: model.name });

    expect(openAiConstructorMock).toHaveBeenCalledWith({
      apiKey: 'bifrost-api-key',
      baseURL: 'http://localhost:8089/openai/v1',
      defaultHeaders: { 'x-bf-vk': 'bifrost-api-key' },
      timeout: 45_000,
      maxRetries: 1,
    });
    expect(createMock).toHaveBeenCalledWith({
      model: 'embedding-model',
      input: ['hello'],
      encoding_format: 'float',
    });
    expect(result).toEqual({
      embeddings: [[0.1, 0.2, 0.3]],
      usage: { promptTokens: 4, totalTokens: 5 },
    });
  });

  it('preserves logical embedding model names containing a slash', async () => {
    createMock.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
      usage: { prompt_tokens: 4, total_tokens: 5 },
    });

    const model = {
      id: 'model-bifrost-embedding',
      name: 'anthropic/claude-embedding-model',
      provider: 'bifrost',
      setting: { provider: 'google', projectId: 'project', location: 'europe-west3' },
    } as AiModel;

    const generateEmbeddings = constructBifrostEmbeddingGenerationFn(model);
    await generateEmbeddings({ texts: ['hello'], model: model.name });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'anthropic/claude-embedding-model' }),
    );
  });
});
