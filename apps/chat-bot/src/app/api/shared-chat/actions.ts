'use server';

import { runServerAction } from '@shared/actions/run-server-action';
import { checkInviteCodeForExport } from '@shared/conversation/conversation-service';
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
}) {
  const params = {
    sharedSessionId,
    inviteCode,
    entityType,
    entityId,
  };

  return checkInviteCodeForExport({ inviteCode }).then(() =>
    runServerAction('loadSharedChatSessionMessagesAction', loadSharedChatSessionMessages)(params),
  );
}
