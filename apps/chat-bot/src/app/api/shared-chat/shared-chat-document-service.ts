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

// The caller is anonymous, so the document is read from the successful generate_document call
// stored in this conversation instead of trusting content sent by the client.
export async function getSharedChatDocument({
  inviteCode,
  entityType,
  entityId,
  sharedSessionId,
  toolCallId,
}: {
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  sharedSessionId: string;
  toolCallId: string;
}): Promise<{ markdown: string; title: string }> {
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
  const hasSucceeded = messages.some(
    (message) =>
      message.role === 'tool' &&
      message.toolCallId === toolCallId &&
      createdToolResultSchema.safeParse(parseJsonRecord(message.content)).success,
  );
  const toolCall = hasSucceeded
    ? messages
        .filter((message) => message.role === 'assistant')
        .flatMap((message) => message.toolCalls ?? [])
        .find((call) => call.id === toolCallId && call.name === TOOL_NAMES.generateDocument)
    : undefined;
  const parsed =
    toolCall === undefined
      ? undefined
      : generateDocumentArgsSchema.safeParse(parseJsonRecord(toolCall.arguments));

  if (parsed?.success !== true) {
    throw new ForbiddenError('Document does not belong to this shared chat');
  }

  return { markdown: parsed.data.content, title: parsed.data.title };
}
