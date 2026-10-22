import { TokenPointsExceededError } from '@ais-chat/ai-core';
import type { LlmModelSelectModel } from '@shared/db/schema';
import { InvalidArgumentError } from '@shared/error';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calculateSpeechCostsInCent: vi.fn(),
  constructNewMessageEvent: vi.fn(),
  constructTokenBudgetExceededEvent: vi.fn(),
  dbGetSpeechModel: vi.fn(),
  dbInsertConversationUsage: vi.fn(),
  generateSpeechById: vi.fn(),
  getCachedSpeechPreview: vi.fn(),
  getConversation: vi.fn(),
  sendRabbitmqEvent: vi.fn(),
  setCachedSpeechPreview: vi.fn(),
  userHasReachedTokenPointsLimit: vi.fn(),
}));

vi.mock('@/app/api/utils/speech-preview-cache', () => ({
  getCachedSpeechPreview: mocks.getCachedSpeechPreview,
  setCachedSpeechPreview: mocks.setCachedSpeechPreview,
}));
vi.mock('@/app/api/utils/utils', () => ({
  calculateSpeechCostsInCent: mocks.calculateSpeechCostsInCent,
}));
vi.mock('@/rabbitmq/events/budget-exceeded', () => ({
  constructTokenBudgetExceededEvent: mocks.constructTokenBudgetExceededEvent,
}));
vi.mock('@/rabbitmq/events/new-message', () => ({
  constructNewMessageEvent: mocks.constructNewMessageEvent,
}));
vi.mock('@/rabbitmq/send', () => ({ sendRabbitmqEvent: mocks.sendRabbitmqEvent }));
vi.mock('@ais-chat/ai-core', () => {
  class TokenPointsExceededError extends Error {}
  return {
    generateSpeechById: mocks.generateSpeechById,
    TokenPointsExceededError,
  };
});
vi.mock('@shared/conversation/conversation-service', () => ({
  getConversation: mocks.getConversation,
}));
vi.mock('@shared/db/functions/llm-model', () => ({ dbGetSpeechModel: mocks.dbGetSpeechModel }));
vi.mock('@shared/db/functions/token-usage', () => ({
  dbInsertConversationUsage: mocks.dbInsertConversationUsage,
}));
vi.mock('@shared/users/usage', () => ({
  userHasReachedTokenPointsLimit: mocks.userHasReachedTokenPointsLimit,
}));

import { generateChatSpeech, generateSpeech, generateSpeechPreview } from './speech-service';

const speechModel = {
  id: 'speech-model-id',
  provider: 'google',
  name: 'speech-model',
  priceMetadata: { type: 'speech', inputTextTokenPrice: 1, outputAudioTokenPrice: 1 },
  modelConfig: { voices: [{ name: 'alloy' }, { name: 'nova' }] },
} as unknown as LlmModelSelectModel;

const wavBuffer = Buffer.from('wav-data');
const user = { id: 'user-id' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbGetSpeechModel.mockResolvedValue(speechModel);
  mocks.generateSpeechById.mockResolvedValue({
    wavBuffer,
    usage: { inputTextTokens: 10, outputAudioTokens: 20 },
  });
  mocks.calculateSpeechCostsInCent.mockReturnValue(42);
  mocks.getConversation.mockResolvedValue({ id: 'conversation-id' });
  mocks.userHasReachedTokenPointsLimit.mockResolvedValue(false);
  mocks.constructTokenBudgetExceededEvent.mockReturnValue({ type: 'budget-exceeded' });
  mocks.constructNewMessageEvent.mockReturnValue({ type: 'new-message' });
});

describe('generateChatSpeech', () => {
  it('sends a budget-exceeded event and aborts without generating or billing when the limit is reached', async () => {
    mocks.userHasReachedTokenPointsLimit.mockResolvedValue(true);

    await expect(
      generateChatSpeech({ user, conversationId: 'conversation-id', text: 'Hello' }),
    ).rejects.toBeInstanceOf(TokenPointsExceededError);

    expect(mocks.sendRabbitmqEvent).toHaveBeenCalledWith({ type: 'budget-exceeded' });
    expect(mocks.generateSpeechById).not.toHaveBeenCalled();
    expect(mocks.dbInsertConversationUsage).not.toHaveBeenCalled();
    expect(mocks.constructNewMessageEvent).not.toHaveBeenCalled();
  });

  it('records the computed cost and emits a new-message event with the upstream provider/model', async () => {
    const result = await generateChatSpeech({
      user,
      conversationId: 'conversation-id',
      text: 'Hello',
      voice: 'nova',
    });

    expect(mocks.dbInsertConversationUsage).toHaveBeenCalledWith({
      conversationId: 'conversation-id',
      userId: 'user-id',
      modelId: speechModel.id,
      completionTokens: 0,
      promptTokens: 0,
      costsInCent: 42,
    });
    expect(mocks.constructNewMessageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        modelName: 'speech-model',
        costsInCent: 42,
        promptTokens: 0,
        completionTokens: 0,
      }),
    );
    expect(mocks.sendRabbitmqEvent).toHaveBeenCalledWith({ type: 'new-message' });
    expect(result).toEqual({ buffer: wavBuffer, contentType: 'audio/wav' });
  });
});

describe('generateSpeech voice resolution', () => {
  it.each([
    ['an unknown voice', 'does-not-exist', 'alloy'],
    ['no voice', undefined, 'alloy'],
    ['a valid voice', 'nova', 'nova'],
  ])('falls back to the first configured voice for %s', async (_label, requested, expected) => {
    await generateSpeech({ text: 'Hello', voice: requested });

    expect(mocks.generateSpeechById).toHaveBeenCalledWith({
      modelId: speechModel.id,
      text: 'Hello',
      voice: expected,
    });
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
