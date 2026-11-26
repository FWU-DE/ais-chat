'use server';
import { SharedChatExpiredError } from '@ais-chat/ai-core/errors';
import { runServerAction } from '@shared/actions/run-server-action';

import { requireValidInviteCode } from '@/auth/requireValidInviteCode';
import { SEND_LEARNING_SCENARIO_MESSAGE_ACTION_NAME } from '@/server-action-names';
import { ChatMessage, createErrorResult } from '@/types/chat';

import { sendLearningScenarioMessage } from './learning-scenario-chat-service';

export type { ChatMessage, SendMessageResult } from '@/types/chat';

export async function sendLearningScenarioMessageAction({
  learningScenarioId,
  inviteCode,
  messages,
  fileIds,
  sharedSessionId,
}: {
  learningScenarioId: string;
  inviteCode: string;
  messages: ChatMessage[];
  fileIds?: string[];
  sharedSessionId?: string;
}) {
  return runServerAction(SEND_LEARNING_SCENARIO_MESSAGE_ACTION_NAME, async () => {
    try {
      await requireValidInviteCode(inviteCode);
    } catch {
      return createErrorResult(new SharedChatExpiredError());
    }

    return sendLearningScenarioMessage({
      learningScenarioId,
      inviteCode,
      messages,
      fileIds,
      sharedSessionId,
    });
  })();
}
