import { checkTextInputSafety } from '@ais-chat/ai-core/chat/safety';
import type { ModelSelection } from '@ais-chat/ai-core';
import type { LlmModelSelectModel } from '@shared/db/schema';
import type { ChatMessage } from '@/types/chat';
import { createImageAttachmentsForConversation } from '../file-operations/preprocess-image';
import {
  convertToAiCoreMessages,
  determineImageAttachmentTypeForModel,
  enrichMessagesWithImageData,
  type FileWithConversationMessageId,
} from './utils';

export async function prepareAgentMessages({
  messages,
  relatedFileEntities,
  model,
  modelSelection,
  safetyModelName,
  apiKeyId,
}: {
  messages: ChatMessage[];
  relatedFileEntities: FileWithConversationMessageId[];
  model: LlmModelSelectModel;
  modelSelection: ModelSelection;
  safetyModelName?: string;
  apiKeyId: string;
}): Promise<ChatMessage[]> {
  const modelSupportsImages =
    model.supportedImageFormats !== null && model.supportedImageFormats.length > 0;
  const imageAttachmentType = determineImageAttachmentTypeForModel(model);
  const extractedImages = await createImageAttachmentsForConversation(
    relatedFileEntities,
    imageAttachmentType,
  );
  const messagesWithImages = enrichMessagesWithImageData(
    messages,
    extractedImages,
    modelSupportsImages,
    imageAttachmentType,
  );

  await checkTextInputSafety({
    modelSelection,
    safetyModelName,
    messages: convertToAiCoreMessages('', messagesWithImages),
    apiKeyId,
  });

  return messagesWithImages;
}
