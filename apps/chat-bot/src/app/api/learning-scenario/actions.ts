'use server';
import * as Sentry from '@sentry/nextjs';
import { requireValidInviteCode } from '@/auth/requireValidInviteCode';
import { sendLearningScenarioMessage } from './learning-scenario-chat-service';
import { ChatMessage, createErrorResult, SendMessageResult } from '@/types/chat';
import { SEND_LEARNING_SCENARIO_MESSAGE_ACTION_NAME } from '@/server-action-names';
import { SharedChatExpiredError } from '@ais-chat/ai-core/errors';

export type { ChatMessage, SendMessageResult } from '@/types/chat';

export async function sendLearningScenarioMessageAction({
  learningScenarioId,
  inviteCode,
  messages,
  modelId,
  fileIds,
  sharedSessionId,
}: {
  learningScenarioId: string;
  inviteCode: string;
  messages: ChatMessage[];
  modelId: string;
  fileIds?: string[];
  sharedSessionId?: string;
}): Promise<SendMessageResult> {
  try {
    await requireValidInviteCode(inviteCode);
  } catch {
    return createErrorResult(new SharedChatExpiredError());
  }

  return Sentry.withServerActionInstrumentation(SEND_LEARNING_SCENARIO_MESSAGE_ACTION_NAME, () =>
    sendLearningScenarioMessage({
      learningScenarioId,
      inviteCode,
      messages,
      modelId,
      fileIds,
      sharedSessionId,
    }),
  );
}
