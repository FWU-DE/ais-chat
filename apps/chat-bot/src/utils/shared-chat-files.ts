import { z } from 'zod';

const signedUrlsResponseSchema = z.object({ urls: z.record(z.string(), z.string()) });

/**
 * Resolves temporary, read-only URLs for previously uploaded shared chat image
 * attachments in a single request. Used to re-display images after a page
 * reload, since blob URLs created at upload time do not survive a reload.
 */
export async function fetchSharedChatFileUrls({
  fileIds,
  inviteCode,
  entityType,
  entityId,
  sharedSessionId,
}: {
  fileIds: string[];
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  sharedSessionId: string;
}): Promise<Record<string, string>> {
  const response = await fetch('/api/v1/shared-chat/files/signed-urls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileIds, inviteCode, entityType, entityId, sharedSessionId }),
  });

  if (!response.ok) {
    throw new Error('Could not resolve shared chat file urls');
  }

  const json = await response.json();
  return signedUrlsResponseSchema.parse(json).urls;
}
