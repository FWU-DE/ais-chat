import { linkFileToSharedChatConversation } from '@shared/db/functions/files';
import { dbGetOrCreateSharedChatConversation } from '@shared/db/functions/shared-chat-conversation';
import { ForbiddenError, InvalidArgumentError } from '@shared/error';
import { SharedSessionId, verify } from '@shared/shared-chat';

import { getUserAndContextByUserId } from '@/auth/utils';

import { uploadFile } from '../file-operations/file-upload-service';
import { getSharedChatEntity } from './shared-chat-get-entity';

/**
 * Uploads a file for a shared (invite-based) chat.
 * Files are stored with `userId: null` and tied to the conversation right away, so only that
 * conversation can attach them to a message.
 */
export async function uploadSharedChatFile({
  file,
  inviteCode,
  entityType,
  entityId,
  sharedSessionId,
}: {
  file: File;
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  sharedSessionId: SharedSessionId;
}): Promise<string> {
  if (sharedSessionId.trim() === '') {
    throw new InvalidArgumentError('sharedSessionId is required');
  }

  const entity = await getSharedChatEntity({ inviteCode, entityType, entityId });

  verify.sharedChatEntityIsAccessible(entity);

  const teacher = await getUserAndContextByUserId({ userId: entity.startedBy });

  const conversation = await dbGetOrCreateSharedChatConversation({
    conversationId: sharedSessionId,
    inviteCode,
    entityType,
    entityId,
  });
  if (conversation === undefined) {
    throw new ForbiddenError('Not authorized to access this shared chat conversation');
  }

  const fileId = await uploadFile({
    file,
    fileMetadata: {},
    userId: null, // shared chat files do not have a userId
    federalStateId: teacher.federalStateId,
  });
  await linkFileToSharedChatConversation({ fileId, conversationId: conversation.id });

  return fileId;
}
