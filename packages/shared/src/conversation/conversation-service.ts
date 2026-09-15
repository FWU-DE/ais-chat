import {
  dbGetConversationById,
  dbGetConversationMessageById,
  dbGetConversationMessages,
  dbGetConversations,
  dbUpdateConversationTitle,
} from '@shared/db/functions/chat';
import { dbGetRelatedFiles } from '@shared/db/functions/files';
import {
  dbDeleteConversationByIdAndUserId,
  dbDoesInviteCodeExist,
} from '@shared/db/functions/conversation';
import { ConversationMessageModel, ConversationModel } from '@shared/db/types';
import { ForbiddenError, NotFoundError } from '@shared/error';
import { dbGetCharacterById } from '@shared/db/functions/character';
import { isToolRelatedMessage } from '@shared/utils/tool-related-message';

/**
 * Returns all conversations that belong to the user for the chat history.
 *
 * @param userId The ID of the user.
 * @returns A promise that resolves to an array of conversations.
 */
export async function getChatHistory(userId: string): Promise<ConversationModel[]> {
  return await dbGetConversations(userId);
}

/**
 * Get a conversation.
 * A conversation starts with the first message.
 * The conversation always belongs to a user.
 * Throws NotFoundError if the conversation does not exist.
 * Throws ForbiddenError if the user is not the owner of this conversation.
 */
export async function getConversation({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}): Promise<ConversationModel> {
  const conversation = await dbGetConversationById(conversationId);
  if (!conversation) throw new NotFoundError('Conversation not found');
  if (conversation.userId !== userId)
    throw new ForbiddenError('Not authorized to access conversation');

  return conversation;
}

/**
 * Returns the messages of a conversation that belongs to the user.
 */
export async function getConversationMessages({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) {
  return await dbGetConversationMessages({
    conversationId,
    userId,
  });
}

/**
 * Deletes a conversation that belongs to the user.
 * Throws an error if the conversation could not be deleted.
 */
export default async function deleteConversation({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) {
  await dbDeleteConversationByIdAndUserId({
    conversationId,
    userId,
  });
}

/**
 *  Triggered by the user if they want to update the name of a conversation.
 *  Throws a NotFoundError if the conversation does not exist or the user is not the owner.
 **/
export async function updateConversationTitle({
  conversationId,
  name,
  userId,
}: {
  conversationId: string;
  name: string;
  userId: string;
}) {
  const result = dbUpdateConversationTitle({ conversationId, name, userId });
  if (!result) {
    throw new NotFoundError('Could not update conversation title');
  }
  return result;
}

/**
 * Authenticated user wants to download a conversation.
 * Verifies that the conversation belongs to the user
 * and returns the conversation and messages for export.
 *
 */
export async function getConversationAndMessagesForExport({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) {
  const conversation = await getConversation({ conversationId, userId });
  let messages = await getConversationMessages({ conversationId, userId });
  const fileMapping = await dbGetRelatedFiles(conversationId);

  if (conversation.characterId) {
    const character = await dbGetCharacterById({
      characterId: conversation.characterId,
      includeDeleted: true,
    });

    if (character?.initialMessage) {
      const initialMessage = {
        role: 'assistant',
        content: character.initialMessage,
      } as ConversationMessageModel;

      messages = [initialMessage, ...messages];
    }
  }
  return {
    conversation,
    messages: messages.filter((message) => !isToolRelatedMessage(message)),
    fileMapping,
  };
}

/**
 * Authenticated user wants to download a single conversation message.
 * Only the selected message is exported.
 */
export async function getConversationMessageForExport({
  conversationId,
  messageId,
  userId,
}: {
  conversationId: string;
  messageId: string;
  userId: string;
}) {
  const conversation = await getConversation({ conversationId, userId });
  const message = await dbGetConversationMessageById({ conversationId, messageId, userId });

  if (!message) {
    throw new NotFoundError('Conversation message not found');
  }

  if (isToolRelatedMessage(message)) {
    throw new NotFoundError('Conversation message not found');
  }

  const fileMapping = await dbGetRelatedFiles(conversationId);

  return {
    conversation,
    message,
    fileMapping,
  };
}

/**
 * An unauthenticated user (student) wants to download a shared conversation.
 * The messages are sent in the request body and are not stored in the database.
 * The invite code needs to exist in the database, otherwise an error is thrown.
 */
export async function checkInviteCodeForExport({ inviteCode }: { inviteCode: string }) {
  const exists = await dbDoesInviteCodeExist(inviteCode);
  if (!exists) {
    throw new NotFoundError('Invite code not found');
  }
}
