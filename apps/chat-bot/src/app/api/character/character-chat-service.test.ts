import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { runAgentLoop } from '@ais-chat/ai-core';
import type { ChatMessage } from '@/types/chat';

const mocks = vi.hoisted(() => ({
  runAgentLoopMock: vi.fn(),
  getUserAndContextByUserIdMock: vi.fn(),
  checkProductAccessMock: vi.fn(),
  sharedCharacterChatHasReachedTokenPointsLimitMock: vi.fn(),
  sharedChatHasExpiredMock: vi.fn(),
  userHasReachedTokenPointsLimitMock: vi.fn(),
  getModelAndApiKeyWithResultMock: vi.fn(),
  getChatModelSelectionMock: vi.fn(),
  dbGetCharacterByIdAndInviteCodeMock: vi.fn(),
  dbUpdateTokenUsageByCharacterChatIdMock: vi.fn(),
  dbGetRelatedCharacterFilesMock: vi.fn(),
  sendRabbitmqEventMock: vi.fn(),
  constructNewMessageEventMock: vi.fn(),
  constructTokenBudgetExceededEventMock: vi.fn(),
  constructCharacterSystemPromptMock: vi.fn(),
  convertToAiCoreMessagesMock: vi.fn(),
  determineImageAttachmentTypeForModelMock: vi.fn(),
  enrichMessagesWithImageDataMock: vi.fn(),
  getMostRecentUserMessageMock: vi.fn(),
  limitChatHistoryMock: vi.fn(),
  annotateMessageAttachmentNamesMock: vi.fn(),
  logErrorMock: vi.fn(),
  buildToolsMock: vi.fn(),
  createImageAttachmentsForConversationMock: vi.fn(),
  ingestWebContentMock: vi.fn(),
  resolveAgentNameForTracingMock: vi.fn(),
  combineSharedRelatedFilesMock: vi.fn(),
  isWebSearchEnabledForEntityMock: vi.fn(),
}));

vi.mock('@ais-chat/ai-core', () => ({
  runAgentLoop: mocks.runAgentLoopMock,
  TokenPointsExceededError: class TokenPointsExceededError extends Error {},
  SharedChatExpiredError: class SharedChatExpiredError extends Error {},
}));

vi.mock('@/auth/utils', () => ({
  getUserAndContextByUserId: mocks.getUserAndContextByUserIdMock,
}));

vi.mock('@/utils/vidis/access', () => ({
  checkProductAccess: mocks.checkProductAccessMock,
}));

vi.mock('@shared/users/usage', () => ({
  sharedCharacterChatHasReachedTokenPointsLimit:
    mocks.sharedCharacterChatHasReachedTokenPointsLimitMock,
  sharedChatHasExpired: mocks.sharedChatHasExpiredMock,
  userHasReachedTokenPointsLimit: mocks.userHasReachedTokenPointsLimitMock,
}));

vi.mock('../utils/utils', () => ({
  getModelAndApiKeyWithResult: mocks.getModelAndApiKeyWithResultMock,
}));

vi.mock('../utils/model-circuit-breaker', () => ({
  getChatModelSelection: mocks.getChatModelSelectionMock,
}));

vi.mock('@shared/db/functions/character', () => ({
  dbGetCharacterByIdAndInviteCode: mocks.dbGetCharacterByIdAndInviteCodeMock,
  dbUpdateTokenUsageByCharacterChatId: mocks.dbUpdateTokenUsageByCharacterChatIdMock,
}));

vi.mock('@shared/db/functions/files', () => ({
  dbGetRelatedCharacterFiles: mocks.dbGetRelatedCharacterFilesMock,
}));

vi.mock('@/rabbitmq/send', () => ({
  sendRabbitmqEvent: mocks.sendRabbitmqEventMock,
}));

vi.mock('@/rabbitmq/events/new-message', () => ({
  constructNewMessageEvent: mocks.constructNewMessageEventMock,
}));

vi.mock('@/rabbitmq/events/budget-exceeded', () => ({
  constructTokenBudgetExceededEvent: mocks.constructTokenBudgetExceededEventMock,
}));

vi.mock('./system-prompt', () => ({
  constructCharacterSystemPrompt: mocks.constructCharacterSystemPromptMock,
}));

vi.mock('../chat/utils', () => ({
  convertToAiCoreMessages: mocks.convertToAiCoreMessagesMock,
  determineImageAttachmentTypeForModel: mocks.determineImageAttachmentTypeForModelMock,
  enrichMessagesWithImageData: mocks.enrichMessagesWithImageDataMock,
  getMostRecentUserMessage: mocks.getMostRecentUserMessageMock,
  limitChatHistory: mocks.limitChatHistoryMock,
  annotateMessageAttachmentNames: mocks.annotateMessageAttachmentNamesMock,
}));

vi.mock('@shared/logging', () => ({
  logError: mocks.logErrorMock,
}));

vi.mock('../chat/build-tools', () => ({
  buildTools: mocks.buildToolsMock,
}));

vi.mock('../file-operations/preprocess-image', () => ({
  createImageAttachmentsForConversation: mocks.createImageAttachmentsForConversationMock,
}));

vi.mock('../rag/ingestWebContent', () => ({
  ingestWebContent: mocks.ingestWebContentMock,
}));

vi.mock('../utils/agent-name', () => ({
  resolveAgentNameForTracing: mocks.resolveAgentNameForTracingMock,
}));

vi.mock('../shared-chat/shared-chat-file-service', () => ({
  combineSharedRelatedFiles: mocks.combineSharedRelatedFilesMock,
}));

vi.mock('../chat/websearch', () => ({
  isWebSearchEnabledForEntity: mocks.isWebSearchEnabledForEntityMock,
}));

const model = {
  id: 'model-1',
  name: 'Test model',
  provider: 'mock-provider',
  supportedImageFormats: [],
};

const character = {
  id: 'character-1',
  name: 'Character',
  attachedLinks: ['https://character.example/context'],
  startedBy: 'teacher-1',
  suspended: false,
};

const teacherUserAndContext = {
  id: 'teacher-1',
  userRole: 'teacher',
  federalState: {
    id: 'federal-state-1',
    featureToggles: { isCalculatorEnabled: true },
  },
};

const messages: ChatMessage[] = [
  {
    id: 'message-1',
    role: 'user',
    content: 'Please use https://student.example/resource for context.',
  },
];

async function collectStream(stream: ReadableStream<string>) {
  const reader = stream.getReader();
  const chunks: string[] = [];

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value !== undefined) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return chunks.join('');
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.dbGetCharacterByIdAndInviteCodeMock.mockResolvedValue(character);
  mocks.getUserAndContextByUserIdMock.mockResolvedValue(teacherUserAndContext);
  mocks.checkProductAccessMock.mockReturnValue({ hasAccess: true });
  mocks.getModelAndApiKeyWithResultMock.mockResolvedValue([null, { model, apiKeyId: 'api-key-1' }]);
  mocks.getChatModelSelectionMock.mockResolvedValue({
    modelIds: [model.id],
    modelName: model.name,
  });
  mocks.sharedChatHasExpiredMock.mockReturnValue(false);
  mocks.sharedCharacterChatHasReachedTokenPointsLimitMock.mockResolvedValue(false);
  mocks.userHasReachedTokenPointsLimitMock.mockResolvedValue(false);
  mocks.dbGetRelatedCharacterFilesMock.mockResolvedValue([]);
  mocks.combineSharedRelatedFilesMock.mockResolvedValue([]);
  mocks.ingestWebContentMock.mockResolvedValue({ processedUrls: [], errorUrls: [] });
  mocks.isWebSearchEnabledForEntityMock.mockReturnValue(true);
  mocks.buildToolsMock.mockResolvedValue({ toolRegistry: {} });
  mocks.constructCharacterSystemPromptMock.mockReturnValue('system-prompt');
  mocks.limitChatHistoryMock.mockImplementation(
    (incomingMessages: ChatMessage[]) => incomingMessages,
  );
  mocks.annotateMessageAttachmentNamesMock.mockImplementation(
    (incomingMessages: ChatMessage[]) => incomingMessages,
  );
  mocks.getMostRecentUserMessageMock.mockImplementation((incomingMessages: ChatMessage[]) =>
    incomingMessages.filter((m) => m.role === 'user').at(-1),
  );
  mocks.determineImageAttachmentTypeForModelMock.mockReturnValue('url');
  mocks.createImageAttachmentsForConversationMock.mockResolvedValue([]);
  mocks.enrichMessagesWithImageDataMock.mockImplementation(
    (incomingMessages: ChatMessage[]) => incomingMessages,
  );
  mocks.convertToAiCoreMessagesMock.mockImplementation(
    (_systemPrompt: string, incomingMessages: ChatMessage[]) => incomingMessages,
  );
  mocks.dbUpdateTokenUsageByCharacterChatIdMock.mockResolvedValue(undefined);
  mocks.constructNewMessageEventMock.mockReturnValue({ type: 'new-message' });
  mocks.sendRabbitmqEventMock.mockResolvedValue(undefined);
  mocks.runAgentLoopMock.mockImplementation(
    ({ onComplete }: Parameters<typeof runAgentLoop>[0]) => {
      void onComplete({
        fullText: 'shared response',
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        priceInCents: 4,
        modelId: model.id,
        modelUsages: [
          {
            modelId: model.id,
            usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
            priceInCents: 4,
          },
        ],
        agentLoopMessages: [],
      });
    },
  );
});

describe('sendCharacterMessage', () => {
  it('ingests attached links and URLs from shared user messages', async () => {
    const { sendCharacterMessage } = await import('./character-chat-service');

    const result = await sendCharacterMessage({
      characterId: character.id,
      inviteCode: 'invite-code',
      messages,
      modelId: model.id,
    });

    await collectStream(result.stream);

    expect(mocks.ingestWebContentMock).toHaveBeenCalledWith({
      urls: ['https://character.example/context'],
      federalStateId: teacherUserAndContext.federalState.id,
    });
    expect(mocks.buildToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({ isCalculatorEnabled: true }),
    );
  });

  it('forwards fileIds to shared file service', async () => {
    const { sendCharacterMessage } = await import('./character-chat-service');

    await sendCharacterMessage({
      characterId: character.id,
      inviteCode: 'invite-code',
      messages,
      modelId: model.id,
      fileIds: ['file-1', 'file-2'],
      sharedSessionId: 'session-1',
    });

    expect(mocks.combineSharedRelatedFilesMock).toHaveBeenCalledWith({
      relatedFileEntities: [],
      fileIds: ['file-1', 'file-2'],
      inviteCode: 'invite-code',
      entityType: 'character',
      entityId: character.id,
      sharedSessionId: 'session-1',
      userMessageId: 'message-1',
    });
  });

  it('passes allowWebTools=false to buildTools when websearch is disabled', async () => {
    const { sendCharacterMessage } = await import('./character-chat-service');
    mocks.getUserAndContextByUserIdMock.mockResolvedValue({
      ...teacherUserAndContext,
      federalState: {
        ...teacherUserAndContext.federalState,
        featureToggles: {
          isWebSearchEnabled: false,
        },
      },
    });
    mocks.isWebSearchEnabledForEntityMock.mockReturnValue(false);
    mocks.buildToolsMock.mockResolvedValue({ toolRegistry: {} });

    await sendCharacterMessage({
      characterId: character.id,
      inviteCode: 'invite-code',
      messages,
      modelId: model.id,
    });

    expect(mocks.isWebSearchEnabledForEntityMock).toHaveBeenCalledWith({
      featureToggles: expect.objectContaining({
        isWebSearchEnabled: false,
      }),
      entity: character,
    });
    expect(mocks.buildToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        allowWebTools: false,
      }),
    );
  });
});
