import type { LlmModelSelectModel } from '@shared/db/schema';
import { InvalidArgumentError } from '@shared/error';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateSpeechById: vi.fn(),
  getCachedSpeechPreview: vi.fn(),
  dbGetSpeechModel: vi.fn(),
  setCachedSpeechPreview: vi.fn(),
}));

vi.mock('@/app/api/utils/speech-preview-cache', () => ({
  getCachedSpeechPreview: mocks.getCachedSpeechPreview,
  setCachedSpeechPreview: mocks.setCachedSpeechPreview,
}));
vi.mock('@ais-chat/ai-core', () => ({
  generateSpeechById: mocks.generateSpeechById,
}));
vi.mock('@shared/db/functions/llm-model', () => ({ dbGetSpeechModel: mocks.dbGetSpeechModel }));

import { generateSpeechPreview } from './speech-service';

const speechModel = {
  id: 'speech-model-id',
  provider: 'google',
  name: 'speech-model',
  priceMetadata: { type: 'speech', inputTextTokenPrice: 1, outputAudioTokenPrice: 1 },
  modelConfig: { voices: [{ name: 'alloy' }, { name: 'nova' }] },
} as unknown as LlmModelSelectModel;

const wavBuffer = Buffer.from('wav-data');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbGetSpeechModel.mockResolvedValue(speechModel);
  mocks.generateSpeechById.mockResolvedValue({
    wavBuffer,
    usage: { inputTextTokens: 10, outputAudioTokens: 20 },
  });
});

describe('generateSpeechPreview', () => {
  it('rejects an unknown voice without generating speech', async () => {
    await expect(
      generateSpeechPreview({ text: 'Hello', voice: 'does-not-exist' }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);

    expect(mocks.generateSpeechById).not.toHaveBeenCalled();
  });

  it('returns the cached preview without regenerating or re-caching', async () => {
    const cachedBuffer = Buffer.from('cached');
    mocks.getCachedSpeechPreview.mockResolvedValue(cachedBuffer);

    const result = await generateSpeechPreview({ text: 'Hello', voice: 'nova' });

    expect(result).toEqual({ buffer: cachedBuffer, contentType: 'audio/wav' });
    expect(mocks.generateSpeechById).not.toHaveBeenCalled();
    expect(mocks.setCachedSpeechPreview).not.toHaveBeenCalled();
  });

  it('generates and caches the preview on a cache miss', async () => {
    mocks.getCachedSpeechPreview.mockResolvedValue(undefined);

    const result = await generateSpeechPreview({ text: 'Hello', voice: 'nova' });

    expect(mocks.generateSpeechById).toHaveBeenCalledWith({
      modelId: speechModel.id,
      text: 'Hello',
      voice: 'nova',
    });
    expect(mocks.setCachedSpeechPreview).toHaveBeenCalledWith(
      speechModel.id,
      'nova',
      'Hello',
      wavBuffer,
    );
    expect(result).toEqual({ buffer: wavBuffer, contentType: 'audio/wav' });
  });
});
