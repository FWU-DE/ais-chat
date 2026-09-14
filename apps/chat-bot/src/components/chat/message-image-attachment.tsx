import React from 'react';
import Image from 'next/image';
import { FileModel } from '@shared/db/schema';
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
};

export default function MessageImageAttachment({
  file,
  width = 200,
  height = 200,
  className,
}: MessageImageAttachmentProps) {
  const localUrl = 'localUrl' in file ? file.localUrl : undefined;
  const imageUrl = localUrl ?? `/api/files/${file.id}/scaled-image?width=${width}&height=${height}`;

  return (
    <Image
      src={imageUrl}
      alt={file.name}
      width={width}
      height={height}
      loading="eager"
      className={cn('max-w-xs h-auto max-h-48 object-cover rounded-enterprise-md', className)}
      unoptimized
    />
  );
}
