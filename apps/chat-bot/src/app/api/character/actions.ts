'use server';
import { SharedChatExpiredError } from '@ais-chat/ai-core/errors';
import { runServerAction } from '@shared/actions/run-server-action';

import { requireValidInviteCode } from '@/auth/requireValidInviteCode';
import { SEND_CHARACTER_MESSAGE_ACTION_NAME } from '@/server-action-names';
import { ChatMessage } from '@/types/chat';

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
}) {
  return runServerAction(SEND_CHARACTER_MESSAGE_ACTION_NAME, async () => {
    try {
      await requireValidInviteCode(inviteCode);
    } catch {
      throw new SharedChatExpiredError();
    }

    return sendCharacterMessage({
      characterId,
      inviteCode,
      messages,
      fileIds,
      sharedSessionId,
    });
  })();
}
