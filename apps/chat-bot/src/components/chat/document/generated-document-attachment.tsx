'use client';

import { logError } from '@shared/logging/logging';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useToast } from '@/components/common/toast';
import type { AiActivityDocument } from '@/types/ai-activity';
import { downloadFileFromBlob } from '@/utils/files/blob-download';
import { createGeneratedDocumentBlob } from '@/utils/files/generated-document';

import DisplayFileAttachment from '../display-file-attachment';

export function GeneratedDocumentAttachment({ document }: { document: AiActivityDocument }) {
  const tCommon = useTranslations('common');
  const toast = useToast();
  const [isDownloading, setIsDownloading] = useState(false);

  async function handleDownload() {
    setIsDownloading(true);
    try {
      downloadFileFromBlob(
        await createGeneratedDocumentBlob(document.content, document.format),
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
