'use client';

import { logError } from '@shared/logging/logging';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useToast } from '@/components/common/toast';
import type { AiActivityDocument } from '@/types/ai-activity';
import { downloadFileFromBlob } from '@/utils/files/blob-download';
import { collectDocumentImageReferences } from '@/utils/files/document-images';
import {
  createGeneratedDocumentBlob,
  type SharedChatDocumentContext,
} from '@/utils/files/generated-document';

import DisplayFileAttachment from '../display-file-attachment';
import type { MessageFileModel } from '../message-image-attachment';

export function GeneratedDocumentAttachment({
  document,
  fileMapping,
  messageFileMapping,
  sharedChat,
}: {
  document: AiActivityDocument;
  fileMapping?: ReadonlyMap<string, readonly MessageFileModel[]>;
  messageFileMapping?: ReadonlyMap<string, readonly MessageFileModel[]>;
  sharedChat?: SharedChatDocumentContext;
}) {
  const tCommon = useTranslations('common');
  const tFiles = useTranslations('file-interaction');
  const toast = useToast();
  const [isDownloading, setIsDownloading] = useState(false);

  async function handleDownload() {
    setIsDownloading(true);
    try {
      downloadFileFromBlob(
        await createGeneratedDocumentBlob(
          document.content,
          document.format,
          collectDocumentImageReferences({ fileMapping, messageFileMapping }),
          document.fileName.replace(/\.[^.]+$/, ''),
          sharedChat,
        ),
        document.fileName,
      );
    } catch (error) {
      logError('Generated document could not be created', error, { format: document.format });
      toast.error(tFiles('toasts.download-error'));
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
