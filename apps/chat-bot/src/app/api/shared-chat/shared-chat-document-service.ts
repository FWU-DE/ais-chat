import {
  dbGetSharedChatConversation,
  dbGetSharedChatConversationMessages,
} from '@shared/db/functions/shared-chat-conversation';
import { ForbiddenError } from '@shared/error';
import { verify } from '@shared/shared-chat';
import { z } from 'zod';

import { generateDocumentArgsSchema } from '@/app/api/chat/tools/generate-document-tool';
import { TOOL_NAMES } from '@/types/tool-names';
import { parseJsonRecord } from '@/utils/chat/tool-result-parsing';

import { getSharedChatEntity } from './shared-chat-get-entity';

const createdToolResultSchema = z.object({ status: z.literal('created') });

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
  // The user is anonymous in shared chats, so the endpoint may only render text the assistant itself produced via
  // generate_document in this conversation, not arbitrary markdown sent by the client.
  const succeededToolCallIds = new Set(
    messages
      .filter(
        (message) =>
          message.role === 'tool' &&
          message.toolCallId !== null &&
          createdToolResultSchema.safeParse(parseJsonRecord(message.content)).success,
      )
      .map((message) => message.toolCallId),
  );
  const isConversationDocument = messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) => message.toolCalls ?? [])
    .filter(
      (toolCall) =>
        toolCall.name === TOOL_NAMES.generateDocument && succeededToolCallIds.has(toolCall.id),
    )
    .some((toolCall) => {
      const parsed = generateDocumentArgsSchema.safeParse(parseJsonRecord(toolCall.arguments));
      return parsed.success && parsed.data.content === markdown;
    });

  if (!isConversationDocument) {
    throw new ForbiddenError('Document does not belong to this shared chat');
  }
}
