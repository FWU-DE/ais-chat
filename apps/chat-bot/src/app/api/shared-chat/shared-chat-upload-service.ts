import { verify } from '@shared/shared-chat';

import { getUserAndContextByUserId } from '@/auth/utils';

import { uploadFile } from '../file-operations/file-upload-service';
import { getSharedChatEntity } from './shared-chat-get-entity';

/**
 * Uploads a file for a shared (invite-based) chat.
 * Files are stored with `userId: null`. They are tied to a conversation once they are
 * attached to a message.
 */
export async function uploadSharedChatFile({
  file,
  inviteCode,
  entityType,
  entityId,
}: {
  file: File;
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
}): Promise<string> {
  const entity = await getSharedChatEntity({ inviteCode, entityType, entityId });

  verify.sharedChatEntityIsAccessible(entity);

  const teacher = await getUserAndContextByUserId({ userId: entity.startedBy });

  return uploadFile({
    file,
    fileMetadata: {},
    userId: null, // shared chat files do not have a userId
    federalStateId: teacher.federalStateId,
  });
}
