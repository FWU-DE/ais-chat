'use client';

import { DownloadSimpleIcon } from '@phosphor-icons/react';
import { ServerActionResult } from '@shared/actions/server-action-result';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import React from 'react';

import { openInNewTab } from '@/utils/navigation/router';

import Spinner from '../icons/spinner';
import { useToast } from './toast';

type DownloadFileButtonProps = {
  fileId: string;
  onDownloadFile: (fileId: string) => Promise<ServerActionResult<string | undefined>>;
};

export default function DownloadFileButton({ fileId, onDownloadFile }: DownloadFileButtonProps) {
  const [isDownloading, setIsDownloading] = React.useState(false);
  const t = useTranslations('file-interaction');
  const toast = useToast();

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const result = await onDownloadFile(fileId);
      if (result.success && result.value) {
        openInNewTab(result.value);
      } else {
        toast.error(t('toasts.download-error'));
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon-round"
      className="text-primary"
      aria-label={t('download.aria-label')}
      onClick={handleDownload}
      disabled={isDownloading}
    >
      {isDownloading ? <Spinner className="size-5" /> : <DownloadSimpleIcon className="size-6" />}
    </Button>
  );
}
