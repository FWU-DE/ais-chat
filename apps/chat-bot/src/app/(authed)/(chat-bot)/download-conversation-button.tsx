'use client';

import { useConversationDownload } from '@/components/chat/conversation-download-context';
import { useToast } from '@/components/common/toast';
import Spinner from '@/components/icons/spinner';
import { useLlmModels } from '@/components/providers/llm-model-provider';
import { downloadFileFromBlob } from '@/utils/files/blob-download';
import {
  createConversationExportMessages,
  formatConversationExport,
  markdownToDocxBlob,
} from '@/utils/files/markdown-docx';
import { cn } from '@/utils/tailwind';
import { BoxArrowDownIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import React from 'react';

type DownloadConversationButtonProps = {
  characterName?: string;
  disabled: boolean;
  showText?: boolean;
  className?: string;
};

type DownloadConversationParams = {
  messages: Parameters<typeof createConversationExportMessages>[0]['messages'];
  fileMapping: Parameters<typeof createConversationExportMessages>[0]['fileMapping'];
  characterName?: string;
  modelName?: string;
};

export async function fetchConversationDownload({
  messages,
  fileMapping,
  characterName,
  modelName,
}: DownloadConversationParams) {
  const exportMessages = createConversationExportMessages({ messages, fileMapping });
  const createdAt = messages[0]?.createdAt?.toISOString() ?? new Date().toISOString();
  const safeName = characterName ?? 'AIS.chat';

  return {
    blob: await markdownToDocxBlob(
      formatConversationExport({
        messages: exportMessages,
        createdAt,
        modelName: modelName ?? safeName,
        conversationTitle: characterName,
      }),
    ),
    fileName: `${createdAt.slice(0, 10)} ${safeName} Gespräch.docx`,
  };
}

export default function DownloadConversationButton({
  characterName,
  disabled = true,
  showText = false,
  className,
}: DownloadConversationButtonProps) {
  const { data } = useConversationDownload();
  const { selectedModel } = useLlmModels();
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
        messages: data?.messages ?? [],
        fileMapping: data?.fileMapping ?? new Map(),
        characterName,
        modelName: selectedModel?.displayName,
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
