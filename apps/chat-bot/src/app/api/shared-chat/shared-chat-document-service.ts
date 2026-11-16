import {
  dbGetSharedChatConversation,
  dbGetSharedChatConversationMessages,
} from '@shared/db/functions/shared-chat-conversation';
import { ForbiddenError } from '@shared/error';
import { verify } from '@shared/shared-chat';

import { extractDocumentBlocks } from '@/utils/code-blocks';

import { getSharedChatEntity } from './shared-chat-get-entity';

// Only documents the assistant wrote in this shared conversation may be rendered.
export async function verifySharedChatDocumentAccess({
  inviteCode,
  entityType,
  entityId,
  sharedSessionId,
  markdown,
}: {
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  sharedSessionId: string;
  markdown: string;
}): Promise<void> {
  const entity = await getSharedChatEntity({ inviteCode, entityType, entityId });
  verify.sharedChatIsNotDeleted(entity);
  verify.sharedChatIsNotSuspended(entity);

  const conversation = await dbGetSharedChatConversation({
    conversationId: sharedSessionId,
    inviteCode,
    entityType,
    entityId,
  });
  const messages =
    conversation === undefined ? [] : await dbGetSharedChatConversationMessages(conversation.id);
  const isConversationDocument = messages
    .filter((message) => message.role === 'assistant')
    .some((message) =>
      extractDocumentBlocks(message.content).some(
        (block) => block.format === 'pdf' && block.content === markdown,
      ),
    );

  if (!isConversationDocument) {
    throw new ForbiddenError('Document does not belong to this shared chat');
  }
}
