import { getUser, userHasCompletedTraining } from '@/auth/utils';
import { checkProductAccess } from '@/utils/vidis/access';
import { dbGetFederalStateWithDecryptedApiKeyWithResult } from '@shared/db/functions/federal-state';
import { dbGetModelByIdAndFederalStateId } from '@shared/db/functions/llm-model';
import { sendRabbitmqEvent } from '@/rabbitmq/send';
import { constructTokenBudgetExceededEvent } from '@/rabbitmq/events/budget-exceeded';
import { constructNewMessageEvent } from '@/rabbitmq/events/new-message';
import {
  dbInsertChatContent,
  dbGetOrCreateConversation,
  dbGetConversationAndMessages,
  dbDeleteRegeneratedConversationMessage,
} from '@shared/db/functions/chat';
import { dbInsertConversationUsage } from '@shared/db/functions/token-usage';
import { logError } from '@shared/logging';
import { generateImageWithBilling } from '@ais-chat/ai-core';
import { LlmModelSelectModel } from '@shared/db/schema';
import { ImageStyle } from '@shared/utils/chat';
import { generateUUID } from '@shared/utils/uuid';
import { deleteFileFromS3, uploadFileToS3, getReadOnlySignedUrl } from '@shared/s3';
import { cnanoid } from '@shared/random/randomService';
import {
  dbDeleteFileAndDetachFromConversation,
  dbDetachFilesFromConversationMessages,
  linkFilesToConversation,
  dbInsertFile,
} from '@shared/db/functions/files';
import { dbDeleteConversationByIdAndUserId } from '@shared/db/functions/conversation';
import { NotFoundError } from '@shared/error';
import { getAvailableImageModelsForFederalState } from '@shared/image-generation/image-generation-service';
import { userHasReachedTokenPointsLimit } from '@shared/users/usage';
import { ImageGenerationRequestOptions } from '@ais-chat/ai-core/images/types';
import { ImageGenerationOptions } from '@/components/image-generation/image-generation-types';
import { validateInputFiles, fetchInputImages } from './image-generation-input-files';

export interface ImageGenerationParams {
  prompt: string;
  modelId: string;
  conversationId: string;
  options: ImageGenerationRequestOptions;
}

export interface ImageGenerationResult {
  created?: number;
  data: Array<string>;
}

/**
 * Creates a new conversation for image generation
 * Returns the conversation ID without generating the image yet
 */
async function createImageConversation(prompt: string): Promise<string> {
  const user = await getUser();

  // Create a new conversation
  const newConversationId = generateUUID();
  const conversation = await dbGetOrCreateConversation({
    conversationId: newConversationId,
    userId: user.id,
    type: 'image-generation',
    name: prompt,
  });

  if (!conversation) {
    throw new Error('Failed to create conversation');
  }

  return conversation.id;
}

/**
 * Generates an image within an existing conversation using the image generation service
 * Combines the conversation management with the actual image generation API
 */
export async function handleImageGeneration({
  prompt,
  model,
  style,
  userId,
  federalStateId,
  options,
  inputFileIds = [],
  conversationId: existingConversationId,
}: {
  prompt: string;
  model: LlmModelSelectModel;
  style?: ImageStyle;
  userId: string;
  federalStateId: string;
  options: ImageGenerationOptions;
  inputFileIds?: string[];
  conversationId?: string;
}) {
  await checkIfImageModelIsAssignedToFederalState(model, federalStateId);

  if (!prompt || prompt.trim().length === 0) {
    throw new Error('Prompt is required');
  }

  validateInputFiles({ model, inputFileIds });

  const inputImages = await fetchInputImages({ inputFileIds, userId });

  let conversationId: string | undefined;
  let generatedFileId: string | undefined;
  let generatedUserMessageId: string | undefined;
  let generatedAssistantMessageId: string | undefined;
  let baseOrderNumber = 0;
  const isExistingConversation = existingConversationId !== undefined;

  try {
    if (isExistingConversation) {
      const existing = await dbGetConversationAndMessages({
        conversationId: existingConversationId,
        userId,
      });
      if (!existing || existing.conversation.type !== 'image-generation') {
        throw new NotFoundError('Image generation conversation not found');
      }
      conversationId = existing.conversation.id;
      baseOrderNumber = existing.messages.reduce(
        (max, msg) => (msg.orderNumber > max ? msg.orderNumber : max),
        0,
      );
    } else {
      conversationId = await createImageConversation(prompt);
    }

    const userOrderNumber = baseOrderNumber + 1;
    const assistantOrderNumber = baseOrderNumber + 2;

    // Construct the full prompt with style prompt if provided
    let fullPrompt = prompt;
    if (style && style.prompt) {
      fullPrompt = `${prompt}. Style: ${style.prompt}`;
    }

    // Store user prompt as a message
    const userMessage = await dbInsertChatContent({
      conversationId: conversationId,
      role: 'user',
      userId: userId,
      content: prompt,
      modelName: model.name,
      orderNumber: userOrderNumber,
      parameters: { imageStyle: style?.name, aspectRatio: options.aspectRatio },
    });

    if (!userMessage) {
      throw new Error('Failed to create user message');
    }
    generatedUserMessageId = userMessage.id;

    if (inputFileIds.length > 0) {
      await linkFilesToConversation({
        conversationMessageId: userMessage.id,
        conversationId,
        fileIds: inputFileIds,
      });
    }

    const size = model.imageGenerationConfig?.aspectRatio?.[options.aspectRatio] ?? 'auto';

    // Generate image using the service
    const result = await generateImage({
      prompt: fullPrompt.trim(),
      modelId: model.id,
      conversationId,
      options: { size, inputImages },
    });

    const image = result.data[0];
    if (!image) {
      throw new Error('No image data received from API');
    }

    // Save image to S3
    const imageBuffer = Buffer.from(image, 'base64');
    const fileId = `file_${cnanoid()}`;
    const key = `message_attachments/${fileId}`;

    await uploadFileToS3({
      key,
      body: imageBuffer,
      contentType: 'image/png',
    });
    generatedFileId = fileId;

    // Create file record in database
    await dbInsertFile({
      id: fileId,
      name: `generated_image_${Date.now()}.png`,
      size: imageBuffer.length,
      type: 'image/png',
      userId,
    });

    // Store generated image as assistant message
    const assistantMessage = await dbInsertChatContent({
      conversationId: conversationId,
      role: 'assistant',
      content: '', // No content needed since we're using file attachment
      orderNumber: assistantOrderNumber,
      modelName: model.name,
      parameters: style ? { imageStyle: style.name } : undefined,
      userId,
    });

    if (!assistantMessage) {
      throw new Error('Failed to create assistant message');
    }
    generatedAssistantMessageId = assistantMessage.id;

    // Link the image file to the assistant message
    await linkFilesToConversation({
      conversationMessageId: assistantMessage.id,
      conversationId: conversationId,
      fileIds: [fileId],
    });

    // Get signed URL for immediate return (still needed for UI display)
    const signedUrl = await getReadOnlySignedUrl({
      key,
      contentType: 'image/png',
      attachment: false,
    });

    // Return the image URL
    return {
      imageUrl: signedUrl,
      conversationId,
      fileId,
      assistantMessageId: assistantMessage.id,
      userMessageId: userMessage.id,
    };
  } catch (error) {
    if (generatedFileId !== undefined) {
      await Promise.allSettled([
        deleteFileFromS3({ key: `message_attachments/${generatedFileId}` }),
        dbDeleteFileAndDetachFromConversation([generatedFileId]),
      ]).then((results) => {
        for (const result of results) {
          if (result.status === 'rejected') {
            logError('Error cleaning up generated image file:', result.reason);
          }
        }
      });
    }

    if (conversationId !== undefined) {
      try {
        if (isExistingConversation) {
          await dbDetachFilesFromConversationMessages(
            [generatedUserMessageId, generatedAssistantMessageId].filter(
              (messageId): messageId is string => messageId !== undefined,
            ),
          );
          await dbDeleteRegeneratedConversationMessage({
            conversationId,
            orderNumber: baseOrderNumber,
          });
        } else {
          await dbDeleteConversationByIdAndUserId({ conversationId, userId });
        }
      } catch (deletionError) {
        logError('Error cleaning up failed image generation:', deletionError);
      }
    }
    throw error instanceof Error
      ? error
      : new Error('Unknown error occurred during image generation');
  }
}

/**
 * Image generation service function
 */
export async function generateImage({
  prompt,
  modelId,
  conversationId,
  options,
}: ImageGenerationParams): Promise<ImageGenerationResult> {
  const [user, hasCompletedTraining] = await Promise.all([getUser(), userHasCompletedTraining()]);
  const productAccess = checkProductAccess({ ...user, hasCompletedTraining });

  if (!productAccess.hasAccess) {
    throw new Error(productAccess.errorType || 'Access denied');
  }

  if (!prompt || prompt.trim().length === 0) {
    throw new Error('Prompt is required');
  }

  const [federalStateError, federalStateObject] =
    await dbGetFederalStateWithDecryptedApiKeyWithResult({
      federalStateId: user.federalState.id,
    });

  if (federalStateError !== null) {
    throw new Error(federalStateError.message);
  }

  if (!federalStateObject.apiKeyId) {
    throw new Error('Federal state has no API key assigned');
  }

  const definedModel = await dbGetModelByIdAndFederalStateId({
    modelId,
    federalStateId: user.federalState.id,
  });

  if (!definedModel) {
    throw new Error(`Model ${modelId} not found`);
  }

  if (definedModel.priceMetadata.type !== 'image') {
    throw new Error('Selected model is not an image generation model');
  }

  // Get conversation for RabbitMQ event
  const conversation = await dbGetOrCreateConversation({
    conversationId,
    userId: user.id,
  });

  const tokenPointsLimitReached = await userHasReachedTokenPointsLimit({ user });

  if (tokenPointsLimitReached) {
    if (conversation) {
      await sendRabbitmqEvent(
        constructTokenBudgetExceededEvent({
          anonymous: false,
          user,
          conversation,
        }),
      );
    }

    throw new Error('User has reached token points limit.');
  }

  try {
    const result = await generateImageWithBilling(
      definedModel.id,
      prompt.trim(),
      federalStateObject.apiKeyId,
      options,
    );

    const costsInCent = result.priceInCents;

    // Track image generation usage
    await dbInsertConversationUsage({
      conversationId,
      userId: user.id,
      modelId: definedModel.id,
      completionTokens: 0, // Images don't have completion tokens
      promptTokens: 0, // Images don't have prompt tokens
      costsInCent: costsInCent,
    });

    if (conversation) {
      // Send RabbitMQ event for successful image generation
      await sendRabbitmqEvent(
        constructNewMessageEvent({
          user,
          promptTokens: 0, // Images don't use tokens
          completionTokens: 0, // Images don't use tokens
          costsInCent: costsInCent,
          provider: definedModel.provider,
          anonymous: false,
          conversation,
        }),
      );
    }

    return {
      data: result.data,
    };
  } catch (error) {
    logError('Image generation failed', { error });
    throw error instanceof Error
      ? error
      : new Error('Internal server error during image generation');
  }
}

// Checks if the given image model is assigned to the federal state
async function checkIfImageModelIsAssignedToFederalState(
  imageModel: LlmModelSelectModel,
  federalStateId: string,
) {
  const models = await getAvailableImageModelsForFederalState({ federalStateId });
  const foundModel = models.find((model) => model.id === imageModel.id);
  if (!foundModel) {
    throw new NotFoundError('Could not find image generation model for federal state');
  }
}
