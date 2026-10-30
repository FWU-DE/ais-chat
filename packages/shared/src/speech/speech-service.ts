import { generateSpeechById } from '@ais-chat/ai-core';
import { UserModel } from '@shared/auth/user-model';
import { getConversation } from '@shared/conversation/conversation-service';
import { dbGetSpeechModel } from '@shared/db/functions/llm-model';
import { dbInsertConversationUsage } from '@shared/db/functions/token-usage';
import { LlmModelSelectModel } from '@shared/db/schema';
import { ConversationModel } from '@shared/db/types';
import { InvalidArgumentError } from '@shared/error';
import { FederalStateModel } from '@shared/federal-states/types';
import { constructNewMessageEvent, sendRabbitmqEvent } from '@shared/rabbitmq';
import { getCachedSpeechPreview, setCachedSpeechPreview } from '@shared/speech/speech-cache';
import {
  runSpeechPipeline,
  SpeechStreamingPipelineParams,
} from '@shared/speech/streaming/speech-pipeline';
import { ChatSpeechStreamResult } from './types';

type SpeechContext = {
  user: UserModel;
  // conversation is null for initial message
  conversation: ConversationModel | null;
};

/**
 * Generates a streaming speech response for a chat message.
 * This function handles loading the conversation context, running the speech pipeline,
 * and storing/reporting usage for the conversation.
 */
export async function generateChatSpeechStream({
  user,
  federalState,
  conversationId,
  text,
  voice,
  abortSignal,
}: {
  user: UserModel;
  federalState: FederalStateModel;
  conversationId?: string;
  text: string;
  voice?: string;
  abortSignal?: AbortSignal;
}): Promise<ChatSpeechStreamResult> {
  return runSpeechPipeline<SpeechContext>(
    {
      user,
      federalState,
      conversationId,
      input: text,
      voice,
      abortSignal,
    },
    {
      loadContext: async (params: SpeechStreamingPipelineParams) => {
        let conversation: ConversationModel | null = null;
        if (params.conversationId) {
          conversation = await getConversation({
            conversationId: params.conversationId,
            userId: params.user.id,
          });
        }
        return { user: params.user, conversation };
      },
      storeUsage: async (
        _params: SpeechStreamingPipelineParams,
        context: SpeechContext,
        model: LlmModelSelectModel,
        result: ChatSpeechStreamResult,
      ) => {
        // we only store usage if there is an associated conversation
        // not true for initial messages
        if (context.conversation) {
          await dbInsertConversationUsage({
            conversationId: context.conversation.id,
            userId: user.id,
            modelId: model.id,
            completionTokens: 0,
            promptTokens: 0,
            costsInCent: await result.costsInCent,
          });
        }
      },
      reportUsage: async (
        _params: SpeechStreamingPipelineParams,
        context: SpeechContext,
        model: LlmModelSelectModel,
        result: ChatSpeechStreamResult,
      ) => {
        if (context.conversation) {
          await sendRabbitmqEvent(
            constructNewMessageEvent({
              user: { ...user, federalState: { id: user.federalStateId } },
              promptTokens: 0,
              completionTokens: 0,
              costsInCent: await result.costsInCent,
              provider: model.provider,
              modelName: model.name,
              anonymous: false,
              conversation: context.conversation,
            }),
          );
        }
      },
    },
  );
}

/**
 * Generates a speech preview where the user can test how a voice sounds.
 * It first checks the cache for an existing preview and returns it if available.
 * If not, it generates the speech preview using the configured speech model and caches the result.
 */
export async function generateSpeechPreview({
  text,
  voice,
}: {
  text: string;
  voice: string;
}): Promise<{
  buffer: Buffer<ArrayBufferLike>;
  contentType: string;
}> {
  const speechModel = await dbGetSpeechModel();

  if (!speechModel) throw new Error('No speech model configured');

  const voices = speechModel.modelConfig?.voices ?? [];

  if (voices.length === 0) throw new Error('No voices configured for the speech model');

  if (!voices.some((v) => v.name === voice)) {
    throw new InvalidArgumentError(`Unknown voice: ${voice}`);
  }

  const cached = await getCachedSpeechPreview(speechModel.id, voice, text);
  if (cached !== undefined) {
    return {
      buffer: cached,
      contentType: 'audio/wav',
    };
  }

  const { wavBuffer } = await generateSpeechById({
    modelId: speechModel.id,
    text,
    voice,
  });

  await setCachedSpeechPreview(speechModel.id, voice, text, wavBuffer);

  return {
    buffer: wavBuffer,
    contentType: 'audio/wav',
  };
}
