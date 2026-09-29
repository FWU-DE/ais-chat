'use server';

import * as Sentry from '@sentry/nextjs';
import { requireAuth } from '@/auth/requireAuth';
import { userHasCompletedTraining } from '@/auth/utils';
import { NotFoundError } from '@shared/error';
import { runServerAction } from '@shared/actions/run-server-action';

import { sendChatMessage } from './chat-service';
import { generateSpeech } from './speech-service';
import { ChatMessage, SendMessageResult, createErrorResult } from '@/types/chat';
import { GENERATE_SPEECH_ACTION_NAME, SEND_CHAT_MESSAGE_ACTION_NAME } from '@/server-action-names';
import { checkProductAccess } from '@/utils/vidis/access';

export type { ChatMessage, SendMessageResult } from '@/types/chat';

export async function sendChatMessageAction({
  conversationId,
  messages,
  modelId,
  characterId,
  learningScenarioId,
  assistantId,
  fileIds,
}: {
  conversationId: string;
  messages: ChatMessage[];
  modelId: string;
  characterId?: string;
  learningScenarioId?: string;
  assistantId?: string;
  fileIds?: string[];
}): Promise<SendMessageResult> {
  const [{ user, federalState }, hasCompletedTraining] = await Promise.all([
    requireAuth(),
    userHasCompletedTraining(),
  ]);
  const userAndContext = {
    ...user,
    federalState,
  };
  const productAccess = checkProductAccess({ ...userAndContext, hasCompletedTraining });

  if (!productAccess.hasAccess) {
    throw new Error(productAccess.errorType);
  }

  return Sentry.withServerActionInstrumentation(SEND_CHAT_MESSAGE_ACTION_NAME, async () => {
    try {
      return await sendChatMessage({
        conversationId,
        messages,
        modelId,
        characterId,
        learningScenarioId,
        assistantId,
        fileIds,
        user: userAndContext,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return createErrorResult(error);
      }
      throw error;
    }
  });
}

export async function generateSpeechAction({ text }: { text: string }) {
  const { federalState } = await requireAuth();
  return runServerAction(
    GENERATE_SPEECH_ACTION_NAME,
    generateSpeech,
  )({
    text,
    federalStateId: federalState.id,
  });
}
