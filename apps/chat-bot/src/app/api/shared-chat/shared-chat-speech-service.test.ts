import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkProductAccess: vi.fn(),
  constructNewMessageEvent: vi.fn(),
  constructTokenBudgetExceededEvent: vi.fn(),
  dbUpdateTokenUsageByCharacterChatId: vi.fn(),
  dbUpdateTokenUsageBySharedLearningScenarioId: vi.fn(),
  generateSpeech: vi.fn(),
  generateStaticMessageSpeech: vi.fn(),
  getSharedChatEntity: vi.fn(),
  getUserAndContextByUserId: vi.fn(),
  requireTeacherRole: vi.fn(),
  sendRabbitmqEvent: vi.fn(),
  sharedCharacterChatHasReachedTokenPointsLimit: vi.fn(),
  sharedChatHasExpired: vi.fn(),
  sharedLearningScenarioChatHasReachedTokenPointsLimit: vi.fn(),
  userHasReachedTokenPointsLimit: vi.fn(),
  verifySharedChatEntityIsAccessible: vi.fn(),
}));

vi.mock('@/app/api/chat/speech-service', () => ({
  generateSpeech: mocks.generateSpeech,
  generateStaticMessageSpeech: mocks.generateStaticMessageSpeech,
}));
vi.mock('@/auth/utils', () => ({ getUserAndContextByUserId: mocks.getUserAndContextByUserId }));
vi.mock('@shared/rabbitmq/events/budget-exceeded', () => ({
  constructTokenBudgetExceededEvent: mocks.constructTokenBudgetExceededEvent,
}));
vi.mock('@shared/rabbitmq/events/new-message', () => ({
  constructNewMessageEvent: mocks.constructNewMessageEvent,
}));
vi.mock('@shared/rabbitmq/send', () => ({ sendRabbitmqEvent: mocks.sendRabbitmqEvent }));
vi.mock('@/utils/vidis/access', () => ({ checkProductAccess: mocks.checkProductAccess }));
vi.mock('@ais-chat/ai-core', () => {
  class TokenPointsExceededError extends Error {}
  return { TokenPointsExceededError };
});
vi.mock('@shared/auth/authorization-service', () => ({
  requireTeacherRole: mocks.requireTeacherRole,
}));
vi.mock('@shared/db/functions/character', () => ({
  dbUpdateTokenUsageByCharacterChatId: mocks.dbUpdateTokenUsageByCharacterChatId,
}));
vi.mock('@shared/db/functions/learning-scenario', () => ({
  dbUpdateTokenUsageBySharedLearningScenarioId: mocks.dbUpdateTokenUsageBySharedLearningScenarioId,
}));
vi.mock('@shared/users/usage', () => ({
  sharedCharacterChatHasReachedTokenPointsLimit:
    mocks.sharedCharacterChatHasReachedTokenPointsLimit,
  sharedChatHasExpired: mocks.sharedChatHasExpired,
  sharedLearningScenarioChatHasReachedTokenPointsLimit:
    mocks.sharedLearningScenarioChatHasReachedTokenPointsLimit,
  userHasReachedTokenPointsLimit: mocks.userHasReachedTokenPointsLimit,
}));
vi.mock('.', () => ({
  verify: { sharedChatEntityIsAccessible: mocks.verifySharedChatEntityIsAccessible },
}));
vi.mock('./shared-chat-get-entity', () => ({ getSharedChatEntity: mocks.getSharedChatEntity }));

import { generateSharedChatSpeech } from './shared-chat-speech-service';

const teacher = {
  id: 'teacher-1',
  userRole: 'teacher',
  federalState: { featureToggles: { isSpeechModelEnabled: true } },
};

const characterEntity = {
  id: 'character-1',
  startedBy: 'teacher-1',
  voice: 'nova',
  isSpeechEnabled: true,
  initialMessage: 'Hello class',
  manuallyStoppedAt: null,
};

const learningScenarioEntity = {
  id: 'scenario-1',
  startedBy: 'teacher-1',
  voice: 'alloy',
  isSpeechEnabled: true,
  manuallyStoppedAt: null,
};

const speechResult = {
  buffer: Buffer.from('wav-data'),
  contentType: 'audio/wav',
  costsInCent: 7,
  modelId: 'speech-model-id',
  provider: 'google',
  modelName: 'speech-model',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSharedChatEntity.mockResolvedValue(characterEntity);
  mocks.getUserAndContextByUserId.mockResolvedValue(teacher);
  mocks.checkProductAccess.mockReturnValue({ hasAccess: true });
  mocks.sharedChatHasExpired.mockReturnValue(false);
  mocks.sharedCharacterChatHasReachedTokenPointsLimit.mockResolvedValue(false);
  mocks.sharedLearningScenarioChatHasReachedTokenPointsLimit.mockResolvedValue(false);
  mocks.userHasReachedTokenPointsLimit.mockResolvedValue(false);
  mocks.generateSpeech.mockResolvedValue(speechResult);
  mocks.constructNewMessageEvent.mockReturnValue({ type: 'new-message' });
  mocks.constructTokenBudgetExceededEvent.mockReturnValue({ type: 'budget-exceeded' });
});

function callForCharacter() {
  return generateSharedChatSpeech({
    inviteCode: 'invite-1',
    entityType: 'character',
    entityId: 'character-1',
    text: 'Hello',
  });
}

describe('generateSharedChatSpeech access control', () => {
  it('rejects when the federal-state speech toggle is disabled', async () => {
    mocks.getUserAndContextByUserId.mockResolvedValue({
      ...teacher,
      federalState: { featureToggles: { isSpeechModelEnabled: false } },
    });

    await expect(callForCharacter()).rejects.toThrow('Speech is not enabled for this shared chat');
    expect(mocks.generateSpeech).not.toHaveBeenCalled();
  });

  it('rejects when speech is disabled on the shared chat entity', async () => {
    mocks.getSharedChatEntity.mockResolvedValue({ ...characterEntity, isSpeechEnabled: false });

    await expect(callForCharacter()).rejects.toThrow('Speech is not enabled for this shared chat');
    expect(mocks.generateSpeech).not.toHaveBeenCalled();
  });

  it('rejects when the owner has no product access', async () => {
    mocks.checkProductAccess.mockReturnValue({ hasAccess: false, errorType: 'no-license' });

    await expect(callForCharacter()).rejects.toThrow('Owner has no product access');
    expect(mocks.generateSpeech).not.toHaveBeenCalled();
  });

  it('rejects when the shared chat has expired', async () => {
    mocks.sharedChatHasExpired.mockReturnValue(true);

    await expect(callForCharacter()).rejects.toThrow('Shared chat has expired');
    expect(mocks.generateSpeech).not.toHaveBeenCalled();
  });
});

describe('generateSharedChatSpeech billing', () => {
  it('bills the character chat and emits an anonymous new-message event', async () => {
    const result = await callForCharacter();

    expect(mocks.generateSpeech).toHaveBeenCalledWith({ text: 'Hello', voice: 'nova' });
    expect(mocks.dbUpdateTokenUsageByCharacterChatId).toHaveBeenCalledWith({
      characterId: 'character-1',
      userId: 'teacher-1',
      modelId: 'speech-model-id',
      completionTokens: 0,
      promptTokens: 0,
      costsInCent: 7,
    });
    expect(mocks.dbUpdateTokenUsageBySharedLearningScenarioId).not.toHaveBeenCalled();
    expect(mocks.constructNewMessageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        anonymous: true,
        character: characterEntity,
        provider: 'google',
        modelName: 'speech-model',
        costsInCent: 7,
      }),
    );
    expect(result).toEqual({ buffer: speechResult.buffer, contentType: 'audio/wav' });
  });

  it('bills the learning-scenario chat and emits an anonymous new-message event', async () => {
    mocks.getSharedChatEntity.mockResolvedValue(learningScenarioEntity);

    const result = await generateSharedChatSpeech({
      inviteCode: 'invite-1',
      entityType: 'learningScenario',
      entityId: 'scenario-1',
      text: 'Hello',
    });

    expect(mocks.generateSpeech).toHaveBeenCalledWith({ text: 'Hello', voice: 'alloy' });
    expect(mocks.dbUpdateTokenUsageBySharedLearningScenarioId).toHaveBeenCalledWith({
      learningScenarioId: 'scenario-1',
      userId: 'teacher-1',
      modelId: 'speech-model-id',
      completionTokens: 0,
      promptTokens: 0,
      costsInCent: 7,
    });
    expect(mocks.dbUpdateTokenUsageByCharacterChatId).not.toHaveBeenCalled();
    expect(mocks.constructNewMessageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        anonymous: true,
        sharedChat: learningScenarioEntity,
        provider: 'google',
        modelName: 'speech-model',
        costsInCent: 7,
      }),
    );
    expect(result).toEqual({ buffer: speechResult.buffer, contentType: 'audio/wav' });
  });
});
