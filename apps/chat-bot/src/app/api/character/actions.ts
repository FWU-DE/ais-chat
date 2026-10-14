'use server';
import { requireValidInviteCode } from '@/auth/requireValidInviteCode';
import { SEND_CHARACTER_MESSAGE_ACTION_NAME } from '@/server-action-names';
import { ChatMessage, createErrorResult, SendMessageResult } from '@/types/chat';
import { SharedChatExpiredError } from '@ais-chat/ai-core/errors';
import * as Sentry from '@sentry/nextjs';
import { sendCharacterMessage } from './character-chat-service';

export type { ChatMessage, SendMessageResult } from '@/types/chat';

export async function sendCharacterMessageAction({
  characterId,
  inviteCode,
  messages,
  fileIds,
  sharedSessionId,
}: {
  characterId: string;
  inviteCode: string;
  messages: ChatMessage[];
  fileIds?: string[];
  sharedSessionId?: string;
}): Promise<SendMessageResult> {
  try {
    await requireValidInviteCode(inviteCode);
  } catch {
    return createErrorResult(new SharedChatExpiredError());
  }

  return Sentry.withServerActionInstrumentation(SEND_CHARACTER_MESSAGE_ACTION_NAME, () =>
    sendCharacterMessage({
      characterId,
      inviteCode,
      messages,
      fileIds,
      sharedSessionId,
    }),
  );
}
