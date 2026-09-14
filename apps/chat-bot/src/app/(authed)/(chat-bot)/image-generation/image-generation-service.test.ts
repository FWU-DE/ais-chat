import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmModelSelectModel } from '@shared/db/schema';

const mocks = vi.hoisted(() => ({
  checkProductAccess: vi.fn(),
  constructNewMessageEvent: vi.fn(),
  dbDeleteFileAndDetachFromConversation: vi.fn(),
  dbDetachFilesFromConversationMessages: vi.fn(),
  dbDeleteRegeneratedConversationMessage: vi.fn(),
  dbGetFederalStateWithDecryptedApiKeyWithResult: vi.fn(),
  dbGetConversationAndMessages: vi.fn(),
  dbGetOrCreateConversation: vi.fn(),
  dbGetModelByIdAndFederalStateId: vi.fn(),
  dbInsertChatContent: vi.fn(),
  dbInsertConversationUsage: vi.fn(),
  dbInsertFile: vi.fn(),
  deleteFileFromS3: vi.fn(),
  fetchInputImages: vi.fn(),
  generateImageWithBilling: vi.fn(),
  getReadOnlySignedUrl: vi.fn(),
  getAvailableImageModelsForFederalState: vi.fn(),
  getUser: vi.fn(),
  linkFilesToConversation: vi.fn(),
  sendRabbitmqEvent: vi.fn(),
  uploadFileToS3: vi.fn(),
  userHasCompletedTraining: vi.fn(),
  userHasReachedTokenPointsLimit: vi.fn(),
}));

vi.mock('@shared/db/functions/chat', () => ({
  dbDeleteRegeneratedConversationMessage: mocks.dbDeleteRegeneratedConversationMessage,
  dbGetConversationAndMessages: mocks.dbGetConversationAndMessages,
  dbGetOrCreateConversation: mocks.dbGetOrCreateConversation,
  dbInsertChatContent: mocks.dbInsertChatContent,
}));
vi.mock('@shared/db/functions/files', () => ({
  dbDeleteFileAndDetachFromConversation: mocks.dbDeleteFileAndDetachFromConversation,
  dbDetachFilesFromConversationMessages: mocks.dbDetachFilesFromConversationMessages,
  dbInsertFile: mocks.dbInsertFile,
  linkFilesToConversation: mocks.linkFilesToConversation,
}));
vi.mock('@shared/db/functions/conversation', () => ({
  dbDeleteConversationByIdAndUserId: vi.fn(),
}));
vi.mock('@shared/s3', () => ({
  deleteFileFromS3: mocks.deleteFileFromS3,
  getReadOnlySignedUrl: mocks.getReadOnlySignedUrl,
  uploadFileToS3: mocks.uploadFileToS3,
}));
vi.mock('@ais-chat/ai-core', () => ({ generateImageWithBilling: mocks.generateImageWithBilling }));
vi.mock('./image-generation-input-files', () => ({
  fetchInputImages: mocks.fetchInputImages,
  validateInputFiles: vi.fn(),
}));
vi.mock('@shared/random/randomService', () => ({ cnanoid: () => 'generated-file' }));
vi.mock('@shared/logging', () => ({ logError: vi.fn() }));
vi.mock('@/auth/utils', () => ({
  getUser: mocks.getUser,
  userHasCompletedTraining: mocks.userHasCompletedTraining,
}));
vi.mock('@/utils/vidis/access', () => ({ checkProductAccess: mocks.checkProductAccess }));
vi.mock('@shared/db/functions/federal-state', () => ({
  dbGetFederalStateWithDecryptedApiKeyWithResult:
    mocks.dbGetFederalStateWithDecryptedApiKeyWithResult,
}));
vi.mock('@shared/db/functions/llm-model', () => ({
  dbGetModelByIdAndFederalStateId: mocks.dbGetModelByIdAndFederalStateId,
}));
vi.mock('@shared/db/functions/token-usage', () => ({
  dbInsertConversationUsage: mocks.dbInsertConversationUsage,
}));
vi.mock('@shared/image-generation/image-generation-service', () => ({
  getAvailableImageModelsForFederalState: mocks.getAvailableImageModelsForFederalState,
}));
vi.mock('@shared/users/usage', () => ({
  userHasReachedTokenPointsLimit: mocks.userHasReachedTokenPointsLimit,
}));
vi.mock('@/rabbitmq/send', () => ({ sendRabbitmqEvent: mocks.sendRabbitmqEvent }));
vi.mock('@/rabbitmq/events/new-message', () => ({
  constructNewMessageEvent: mocks.constructNewMessageEvent,
}));
vi.mock('@/rabbitmq/events/budget-exceeded', () => ({
  constructTokenBudgetExceededEvent: vi.fn(),
}));

import { handleImageGeneration } from './image-generation-service';

const imageModel = {
  id: 'model-id',
  provider: 'bifrost',
  name: 'image-model',
  displayName: 'Image Model',
  description: '',
  priceMetadata: { type: 'image', pricePerImageInCent: 1 },
  createdAt: new Date('2026-01-01'),
  imageGenerationConfig: { aspectRatio: { quadratic: '1024x1024' } },
  supportedImageFormats: ['png'],
  isNew: false,
  isDeleted: false,
} as LlmModelSelectModel;

function prepareExistingConversation() {
  mocks.dbGetConversationAndMessages.mockResolvedValue({
    conversation: { id: 'conversation-id', type: 'image-generation' },
    messages: [{ id: 'previous-assistant', role: 'assistant', orderNumber: 2 }],
  });
  mocks.fetchInputImages.mockResolvedValue([]);
  mocks.getAvailableImageModelsForFederalState.mockResolvedValue([imageModel]);
  mocks.getUser.mockResolvedValue({ id: 'user-id', federalState: { id: 'DE-TEST' } });
  mocks.userHasCompletedTraining.mockResolvedValue(true);
  mocks.checkProductAccess.mockReturnValue({ hasAccess: true });
  mocks.dbGetFederalStateWithDecryptedApiKeyWithResult.mockResolvedValue([
    null,
    { apiKeyId: 'api-key-id' },
  ]);
  mocks.dbGetModelByIdAndFederalStateId.mockResolvedValue({
    ...imageModel,
    priceMetadata: { type: 'image' },
  });
  mocks.dbGetOrCreateConversation.mockResolvedValue({ id: 'conversation-id' });
  mocks.userHasReachedTokenPointsLimit.mockResolvedValue(false);
  mocks.generateImageWithBilling.mockResolvedValue({
    data: [Buffer.from('image').toString('base64')],
    priceInCents: 1,
  });
  mocks.dbInsertChatContent
    .mockResolvedValueOnce({ id: 'new-user-message' })
    .mockResolvedValueOnce({ id: 'new-assistant-message' });
  mocks.getReadOnlySignedUrl.mockResolvedValue('https://example.com/generated.png');
}

describe('handleImageGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareExistingConversation();
  });

  it('persists a second version and attaches the selected generated image to its prompt', async () => {
    const result = await handleImageGeneration({
      prompt: 'Make it blue',
      model: imageModel,
      userId: 'user-id',
      federalStateId: 'DE-TEST',
      options: { aspectRatio: 'quadratic' },
      inputFileIds: ['previous-generated-file'],
      conversationId: 'conversation-id',
    });

    expect(mocks.linkFilesToConversation).toHaveBeenNthCalledWith(1, {
      conversationMessageId: 'new-user-message',
      conversationId: 'conversation-id',
      fileIds: ['previous-generated-file'],
    });
    expect(mocks.dbInsertChatContent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ orderNumber: 3, role: 'user' }),
    );
    expect(mocks.dbInsertChatContent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ orderNumber: 4, role: 'assistant' }),
    );
    expect(result).toMatchObject({
      conversationId: 'conversation-id',
      fileId: 'file_generated-file',
      userMessageId: 'new-user-message',
      assistantMessageId: 'new-assistant-message',
    });
  });

  it('removes the generated file when signing its URL fails', async () => {
    mocks.getReadOnlySignedUrl.mockRejectedValueOnce(new Error('Signing failed'));

    await expect(
      handleImageGeneration({
        prompt: 'Make it blue',
        model: imageModel,
        userId: 'user-id',
        federalStateId: 'DE-TEST',
        options: { aspectRatio: 'quadratic' },
        conversationId: 'conversation-id',
      }),
    ).rejects.toThrow('Signing failed');

    expect(mocks.deleteFileFromS3).toHaveBeenCalledWith({
      key: 'message_attachments/file_generated-file',
    });
    expect(mocks.dbDeleteFileAndDetachFromConversation).toHaveBeenCalledWith([
      'file_generated-file',
    ]);
    expect(mocks.dbDetachFilesFromConversationMessages).toHaveBeenCalledWith([
      'new-user-message',
      'new-assistant-message',
    ]);
    expect(mocks.dbDeleteRegeneratedConversationMessage).toHaveBeenCalledWith({
      conversationId: 'conversation-id',
      orderNumber: 2,
    });
  });
});
