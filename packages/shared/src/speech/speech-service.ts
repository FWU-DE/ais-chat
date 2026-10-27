import { UserModel } from '@shared/auth/user-model';
import { getConversation } from '@shared/conversation/conversation-service';
import { dbInsertConversationUsage } from '@shared/db/functions/token-usage';
import { LlmModelSelectModel } from '@shared/db/schema';
import { ConversationModel } from '@shared/db/types';
import { FederalStateModel } from '@shared/federal-states/types';
import { constructNewMessageEvent, sendRabbitmqEvent } from '@shared/rabbitmq';
import {
  runSpeechPipeline,
  SpeechStreamingPipelineParams,
} from '@shared/speech/streaming/speech-pipeline';
import { ChatSpeechStreamResult } from './types';

type SpeechContext = {
  user: UserModel;
  conversation: ConversationModel;
};

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
  conversationId: string;
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
        const conversation = await getConversation({
          conversationId: params.conversationId!,
          userId: params.user.id,
        });
        return { user: params.user, conversation };
      },
      storeUsage: async (
        _params: SpeechStreamingPipelineParams,
        context: SpeechContext,
        model: LlmModelSelectModel,
        result: ChatSpeechStreamResult,
      ) => {
        await dbInsertConversationUsage({
          conversationId: context.conversation.id,
          userId: user.id,
          modelId: model.id,
          completionTokens: 0,
          promptTokens: 0,
          costsInCent: await result.costsInCent,
        });
      },
      reportUsage: async (
        _params: SpeechStreamingPipelineParams,
        context: SpeechContext,
        model: LlmModelSelectModel,
        result: ChatSpeechStreamResult,
      ) => {
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
      },
    },
  );
}
