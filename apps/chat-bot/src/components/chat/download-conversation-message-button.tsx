'use client';

import { useToast } from '@/components/common/toast';
import Spinner from '@/components/icons/spinner';
import type { ChatMessage } from '@/types/chat';
import { downloadFileFromBlob } from '@/utils/files/blob-download';
import {
  createConversationExportMessages,
  formatConversationExport,
  markdownToDocxBlob,
} from '@/utils/files/markdown-docx';
import { DownloadSimpleIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import React from 'react';
import type { ConversationDownloadFile } from './conversation-download-context';

type DownloadConversationMessageButtonProps = {
  message: ChatMessage;
  files: ConversationDownloadFile[];
  characterName?: string;
};

type DownloadConversationMessageParams = {
  message: DownloadConversationMessageButtonProps['message'];
  files: ConversationDownloadFile[];
  characterName?: string;
};

export async function fetchConversationMessageDownload({
  message,
  files,
  characterName,
}: DownloadConversationMessageParams) {
  const createdAt = message.createdAt?.toISOString() ?? new Date().toISOString();
  const exportMessages = createConversationExportMessages({
    messages: [message],
    fileMapping: new Map([[message.id, files]]),
  });
  const safeName = characterName ?? 'AIS.chat';

  return {
    blob: await markdownToDocxBlob(
      formatConversationExport({
        messages: exportMessages,
        createdAt,
        modelName: safeName,
      }),
    ),
    fileName: `${createdAt.slice(0, 10)} ${safeName} Antwort.docx`,
  };
}

export default function DownloadConversationMessageButton({
  message,
  files,
  characterName,
}: DownloadConversationMessageButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const toast = useToast();
  const tCommon = useTranslations('common');

  async function handleDownload() {
    try {
      setIsLoading(true);

      const { blob, fileName } = await fetchConversationMessageDownload({
        message,
        files,
        characterName,
      });

      downloadFileFromBlob(blob, fileName);
    } catch {
      toast.error(tCommon('message-download-error'));
    } finally {
      setIsLoading(false);
    }
  }

  const label = tCommon('message-download');

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={handleDownload}
      disabled={isLoading}
      aria-label={label}
      title={label}
      className="text-primary"
    >
      {isLoading ? (
        <Spinner className="p-1 size-5" />
      ) : (
        <DownloadSimpleIcon className="size-4 text-primary" />
      )}
    </Button>
  );
}
