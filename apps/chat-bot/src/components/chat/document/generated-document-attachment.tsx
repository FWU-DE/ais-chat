'use client';

import { logError } from '@shared/logging/logging';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useToast } from '@/components/common/toast';
import type { AiActivityDocument } from '@/types/ai-activity';
import { downloadFileFromBlob } from '@/utils/files/blob-download';
import {
  type DocumentImageReferences,
  getDocumentAttachmentReference,
} from '@/utils/files/document-images';
import { createGeneratedDocumentBlob } from '@/utils/files/generated-document';
import { isImageFile } from '@/utils/files/generic';

import DisplayFileAttachment from '../display-file-attachment';

type DocumentImageFile = {
  id: string;
  name: string;
  localUrl?: string;
};

function createImageReferences(
  fileMapping?: ReadonlyMap<string, readonly DocumentImageFile[]>,
  messageFileMapping?: ReadonlyMap<string, readonly DocumentImageFile[]>,
): DocumentImageReferences {
  const imageReferences = new Map<string, string>();
  for (const files of [fileMapping?.values(), messageFileMapping?.values()]) {
    for (const fileList of files ?? []) {
      for (const file of fileList) {
        if (!isImageFile(file.name)) {
          continue;
        }
        imageReferences.set(
          getDocumentAttachmentReference(file.id),
          file.localUrl ?? `/api/files/${file.id}/scaled-image?width=240&height=240`,
        );
      }
    }
  }
  return imageReferences;
}

export function GeneratedDocumentAttachment({
  document,
  fileMapping,
  messageFileMapping,
}: {
  document: AiActivityDocument;
  fileMapping?: ReadonlyMap<string, readonly DocumentImageFile[]>;
  messageFileMapping?: ReadonlyMap<string, readonly DocumentImageFile[]>;
}) {
  const tCommon = useTranslations('common');
  const toast = useToast();
  const [isDownloading, setIsDownloading] = useState(false);

  async function handleDownload() {
    setIsDownloading(true);
    try {
      downloadFileFromBlob(
        await createGeneratedDocumentBlob(
          document.content,
          document.format,
          createImageReferences(fileMapping, messageFileMapping),
        ),
        document.fileName,
      );
    } catch (error) {
      logError('Generated document could not be created', error, { format: document.format });
      toast.error(tCommon('document.error'));
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <DisplayFileAttachment
      fileName={document.fileName}
      status={isDownloading ? 'uploading' : 'processed'}
      onDownload={handleDownload}
      downloadDisabled={isDownloading}
      downloadLabel={tCommon('document.download', { fileName: document.fileName })}
    />
  );
}
