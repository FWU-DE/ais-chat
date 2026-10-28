import { getUserAndContextByUserId } from '@/auth/utils';
import { InvalidArgumentError } from '@shared/error';
import { SharedChatFileMetadata, SharedSessionId, verify } from '@shared/shared-chat';
import { uploadFile } from '../file-operations/file-upload-service';
import { getSharedChatEntity } from './shared-chat-get-entity';

/**
 * Uploads a file for a shared (invite-based) chat.
 * Files are stored with `userId: null` and a metadata object
 * that contains invite code and session information.
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

  const fileMetadata: SharedChatFileMetadata = {
    entityId: entity.id,
    entityType: entityType,
    inviteCode: inviteCode,
    sessionId: sharedSessionId,
  };

  return uploadFile({
    file,
    fileMetadata, // contains invite code, entity type and id, etc.
    userId: null, // shared chat files do not have a userId
    federalStateId: teacher.federalStateId,
  });
}
