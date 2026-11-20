'use server';

import { dbVerifyFileOwnership } from '@shared/db/functions/files';
import { ForbiddenError } from '@shared/error';
import { getReadOnlySignedUrl } from '@shared/s3';

import { requireAuth } from '@/auth/requireAuth';

const MESSAGE_ATTACHMENTS_PREFIX = 'message_attachments/';

export async function getReadOnlySignedUrlAction({
  key,
  filename,
  contentType,
  attachment,
  options,
}: {
  key: string;
  filename?: string;
  contentType?: string;
  attachment?: boolean;
  options?: { expiresIn?: number };
}) {
  const { user } = await requireAuth();

  if (key && key.startsWith(MESSAGE_ATTACHMENTS_PREFIX)) {
    const fileId = key.slice(MESSAGE_ATTACHMENTS_PREFIX.length);
    const isOwner = await dbVerifyFileOwnership({ fileId, userId: user.id });
    if (!isOwner) {
      throw new ForbiddenError('Not authorized to access this file');
    }
  } else if (key) {
    // Only message_attachments keys are allowed from client actions
    throw new ForbiddenError('Not authorized to access this resource');
  }

  return getReadOnlySignedUrl({ key, filename, contentType, attachment, options });
}
