import React from 'react';
import Image from 'next/image';
import { FileModel } from '@shared/db/schema';
import { Skeleton } from '@ais-chat/ui/components/skeleton';
import { cn } from '@/utils/tailwind';

// Minimal type required to render an image attachment chip
export type ImageAttachment = Pick<FileModel, 'id' | 'name'>;

// Extended type for pending files that includes a local blob URL
export type PendingFileModel = FileModel & { localUrl?: string };

type MessageImageAttachmentProps = {
  file: ImageAttachment | PendingFileModel;
  width?: number;
  height?: number;
  className?: string;
  /**
   * Whether the regular authenticated-file fallback is valid when no `localUrl`
   * is set. Shared-chat renders can intentionally disable this because anonymous
   * viewers must resolve a shared-chat-scoped image URL instead of the
   * authenticated `/api/files/[fileId]/scaled-image` route.
   */
  allowFallbackUrl?: boolean;
};

export default function MessageImageAttachment({
  file,
  width = 200,
  height = 200,
  className,
  allowFallbackUrl = true,
}: MessageImageAttachmentProps) {
  const localUrl = 'localUrl' in file ? file.localUrl : undefined;

  if (localUrl === undefined && !allowFallbackUrl) {
    return (
      <Skeleton
        className={cn('max-w-xs rounded-enterprise-md', className)}
        style={{ width, height }}
      />
    );
  }

  const imageUrl = localUrl ?? `/api/files/${file.id}/scaled-image?width=${width}&height=${height}`;

  return (
    <Image
      src={imageUrl}
      alt={file.name}
      width={width}
      height={height}
      loading="eager"
      className={cn(
        'max-w-xs w-auto h-auto max-h-48 object-contain rounded-enterprise-md',
        className,
      )}
      unoptimized
    />
  );
}
