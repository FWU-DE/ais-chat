'use server';

import { requireValidInviteCode } from '@/auth/requireValidInviteCode';
import type { ChatMessage } from '@/types/chat';
import { SharedChatExpiredError } from '@ais-chat/ai-core/errors';
import { loadSharedChatSessionMessages } from './shared-chat-session-service';

export async function loadSharedChatSessionMessagesAction({
  sharedSessionId,
  inviteCode,
  entityType,
  entityId,
}: {
  sharedSessionId: string;
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
}): Promise<ChatMessage[]> {
  try {
    await requireValidInviteCode(inviteCode);
  } catch {
    throw new SharedChatExpiredError();
  }

  return loadSharedChatSessionMessages({
    sharedSessionId,
    inviteCode,
    entityType,
    entityId,
  });
}
