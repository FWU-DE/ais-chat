'use server';

import { runServerAction } from '@shared/actions/run-server-action';
import { checkInviteCodeForExport } from '@shared/conversation/conversation-service';

import { loadSharedChatConversationMessages } from './shared-chat-conversation-service';

export async function loadSharedChatConversationMessagesAction({
  sharedSessionId,
  inviteCode,
  entityType,
  entityId,
}: {
  sharedSessionId: string;
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
}) {
  const params = {
    sharedSessionId,
    inviteCode,
    entityType,
    entityId,
  };

  await checkInviteCodeForExport({ inviteCode });

  return runServerAction(
    'loadSharedChatConversationMessagesAction',
    loadSharedChatConversationMessages,
  )(params);
}
