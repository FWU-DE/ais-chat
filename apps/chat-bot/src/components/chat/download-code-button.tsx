'use client';

import { DownloadSimpleIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';

import { useToast } from '@/components/common/toast';
import { getCodeFileName } from '@/utils/code-blocks';
import { downloadFileFromBlob } from '@/utils/files/blob-download';

type DownloadCodeButtonProps = {
  code: string;
  language?: string;
  title?: string;
};

export default function DownloadCodeButton({ code, language, title }: DownloadCodeButtonProps) {
  const toast = useToast();
  const t = useTranslations('common');
  const tFiles = useTranslations('file-interaction');

  async function handleDownload() {
    try {
      const fileName = await getCodeFileName({ language, title });
      downloadFileFromBlob(new Blob([code], { type: 'application/octet-stream' }), fileName);
    } catch {
      toast.error(tFiles('toasts.download-error'));
    }
  }

  const label = t('code-download');

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-round"
      aria-label={label}
      title={label}
      data-testid="download-code"
      onClick={handleDownload}
      className="text-primary"
    >
      <DownloadSimpleIcon className="size-3" aria-hidden="true" />
    </Button>
  );
}
