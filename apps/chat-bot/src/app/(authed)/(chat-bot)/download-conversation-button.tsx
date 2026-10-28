'use client';

import { useToast } from '@/components/common/toast';
import Spinner from '@/components/icons/spinner';
import { downloadFileFromBlob } from '@/utils/files/blob-download';
import { formatConversationExport, markdownToDocxBlob } from '@/utils/files/markdown-docx';
import { cn } from '@/utils/tailwind';
import { BoxArrowDownIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import React from 'react';

type DownloadConversationButtonProps = {
  conversationId: string;
  characterName?: string;
  disabled: boolean;
  showText?: boolean;
  className?: string;
};

type DownloadConversationParams = {
  conversationId: string;
  characterName?: string;
};

export async function fetchConversationDownload({
  conversationId,
  characterName,
}: DownloadConversationParams) {
  const searchParams = new URLSearchParams({
    conversationId,
  });

  if (characterName !== undefined) {
    searchParams.append('enterpriseGptName', characterName);
  }

  const response = await fetch(`/api/download-conversation?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error('Failed to download the document');
  }

  const responseData = (await response.json()) as {
    fileName: string;
    conversationTitle: string | null;
    createdAt: string;
    modelName: string;
    messages: Array<{
      role: string;
      content: string;
      images: Array<{ alt: string; url: string }>;
    }>;
  };
  const { fileName, conversationTitle, createdAt, modelName, messages } = responseData;

  return {
    blob: await markdownToDocxBlob(
      formatConversationExport({
        messages,
        createdAt,
        modelName,
        conversationTitle: conversationTitle ?? undefined,
      }),
    ),
    fileName,
  };
}

export default function DownloadConversationButton({
  conversationId,
  characterName,
  disabled = true,
  showText = false,
  className,
}: DownloadConversationButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const toast = useToast();
  const tCommon = useTranslations('common');

  async function handleDownload() {
    if (disabled) {
      return;
    }
    try {
      setIsLoading(true);

      const { blob, fileName } = await fetchConversationDownload({
        conversationId,
        characterName,
      });

      downloadFileFromBlob(blob, fileName);
    } catch {
      toast.error('Der Download der Konversation ist fehlgeschlagen.');
    } finally {
      setIsLoading(false);
    }
  }

  const t = useTranslations('common');

  return (
    <Button
      variant="ghost"
      size="icon-round"
      className={cn('text-primary', className)}
      title={t('conversation-download')}
      onClick={handleDownload}
      disabled={disabled}
    >
      {isLoading ? (
        <Spinner className="p-2 size-8" />
      ) : (
        <BoxArrowDownIcon className="size-6 text-primary" />
      )}
      {showText && tCommon('conversation-download')}
    </Button>
  );
}
