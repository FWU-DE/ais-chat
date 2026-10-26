'use client';

import { useToast } from '@/components/common/toast';
import Spinner from '@/components/icons/spinner';
import { downloadFileFromBlob } from '@/utils/files/blob-download';
import { formatConversationExport, markdownToDocxBlob } from '@/utils/files/markdown-docx';
import { DownloadSimpleIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import React from 'react';

type DownloadConversationMessageButtonProps = {
  conversationId: string;
  messageId: string;
  characterName?: string;
};

type DownloadConversationMessageParams = {
  conversationId: string;
  messageId: string;
  characterName?: string;
};

export async function fetchConversationMessageDownload({
  conversationId,
  messageId,
  characterName,
}: DownloadConversationMessageParams) {
  const searchParams = new URLSearchParams({
    conversationId,
    messageId,
  });

  if (characterName !== undefined) {
    searchParams.append('enterpriseGptName', characterName);
  }

  const response = await fetch(`/api/download-conversation?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error('Failed to download the document');
  }

  const { fileName, createdAt, modelName, messages } = (await response.json()) as {
    fileName: string;
    createdAt: string;
    modelName: string;
    messages: Array<{
      role: string;
      content: string;
      images: Array<{ alt: string; url: string }>;
    }>;
  };

  return {
    blob: await markdownToDocxBlob(formatConversationExport({ messages, createdAt, modelName })),
    fileName,
  };
}

export default function DownloadConversationMessageButton({
  conversationId,
  messageId,
  characterName,
}: DownloadConversationMessageButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const toast = useToast();
  const tCommon = useTranslations('common');

  async function handleDownload() {
    try {
      setIsLoading(true);

      const { blob, fileName } = await fetchConversationMessageDownload({
        conversationId,
        messageId,
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
