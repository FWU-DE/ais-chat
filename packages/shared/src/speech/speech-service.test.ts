import type { LlmModelSelectModel } from '@shared/db/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateSpeechById: vi.fn(),
  getCachedSpeechPreview: vi.fn(),
  dbGetSpeechModel: vi.fn(),
  setCachedSpeechPreview: vi.fn(),
}));

vi.mock('@shared/speech/speech-cache', () => ({
  getCachedSpeechPreview: mocks.getCachedSpeechPreview,
  setCachedSpeechPreview: mocks.setCachedSpeechPreview,
}));
vi.mock('@ais-chat/ai-core', () => ({
  generateSpeechById: mocks.generateSpeechById,
  MP3_MIME_TYPE: 'audio/mpeg',
}));
vi.mock('@shared/db/functions/llm-model', () => ({ dbGetSpeechModel: mocks.dbGetSpeechModel }));

import { generateSpeechPreview } from './speech-service';

const speechModel = {
  id: 'speech-model-id',
  provider: 'bifrost',
  name: 'speech-model',
  priceMetadata: { type: 'speech', inputTextTokenPrice: 1, outputAudioTokenPrice: 1 },
  modelConfig: { voices: [{ name: 'alloy' }, { name: 'nova' }] },
} as unknown as LlmModelSelectModel;

const mp3Buffer = Buffer.from('mp3-data');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbGetSpeechModel.mockResolvedValue(speechModel);
  mocks.generateSpeechById.mockResolvedValue({
    audioBuffer: mp3Buffer,
    mimeType: 'audio/mpeg',
    usage: { inputTextTokens: 10, outputAudioTokens: 20 },
  });
});

describe('generateSpeechPreview', () => {
  it('falls back to the first configured voice for an unknown voice', async () => {
    mocks.getCachedSpeechPreview.mockResolvedValue(undefined);

    await generateSpeechPreview({ text: 'Hello', voice: 'does-not-exist' });

    expect(mocks.generateSpeechById).toHaveBeenCalledWith({
      modelId: speechModel.id,
      text: 'Hello',
      voice: 'alloy',
    });
  });

  it('returns the cached preview without regenerating or re-caching', async () => {
    const cachedBuffer = Buffer.from('cached');
    mocks.getCachedSpeechPreview.mockResolvedValue(cachedBuffer);

    const result = await generateSpeechPreview({ text: 'Hello', voice: 'nova' });

    expect(result).toEqual({ buffer: cachedBuffer, contentType: 'audio/mpeg' });
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
      mp3Buffer,
    );
    expect(result).toEqual({ buffer: mp3Buffer, contentType: 'audio/mpeg' });
  });
});
