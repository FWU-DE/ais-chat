import { z } from 'zod';

const signedUrlResponseSchema = z.object({ url: z.string() });

/**
 * Resolves a temporary, read-only URL for a previously uploaded shared chat
 * file attachment. Used to re-display images after a page reload, since
 * blob URLs created at upload time do not survive a reload.
 */
export async function fetchSharedChatFileUrl({
  fileId,
  inviteCode,
  entityType,
  entityId,
  sharedSessionId,
}: {
  fileId: string;
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  sharedSessionId: string;
}): Promise<string> {
  const params = new URLSearchParams({ inviteCode, entityType, entityId, sharedSessionId });
  const response = await fetch(
    `/api/v1/shared-chat/files/${fileId}/signed-url?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error('Could not resolve shared chat file url');
  }

  const json = await response.json();
  return signedUrlResponseSchema.parse(json).url;
}
