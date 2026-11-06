'use server';

import * as Sentry from '@sentry/nextjs';
import { NotFoundError } from '@shared/error';

import { requireAuth } from '@/auth/requireAuth';
import { userHasCompletedTraining } from '@/auth/utils';
import { SEND_CHAT_MESSAGE_ACTION_NAME } from '@/server-action-names';
import { ChatMessage, createErrorResult, SendMessageResult } from '@/types/chat';
import { checkProductAccess } from '@/utils/vidis/access';

import { sendChatMessage } from './chat-service';

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
