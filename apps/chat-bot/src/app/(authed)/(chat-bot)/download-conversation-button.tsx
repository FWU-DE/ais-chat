'use client';

import {
  type ConversationDownloadData,
  useConversationDownload,
} from '@/components/chat/conversation-download-context';
import { useToast } from '@/components/common/toast';
import Spinner from '@/components/icons/spinner';
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
  createdAt: Date;
  conversationTitle?: string;
  characterName?: string;
  modelName?: string;
};

export async function fetchConversationDownload({
  messages,
  fileMapping,
  createdAt,
  conversationTitle,
  characterName,
  modelName,
}: DownloadConversationParams) {
  const exportMessages = createConversationExportMessages({ messages, fileMapping });
  const createdAtISOString = createdAt.toISOString();
  const gptName = characterName ?? 'AIS.chat';
  const conversationName = conversationTitle ?? 'Konversation';

  return {
    blob: await markdownToDocxBlob(
      formatConversationExport({
        messages: exportMessages,
        createdAt: createdAtISOString,
        modelName: modelName ?? 'AIS.chat',
        conversationTitle,
      }),
    ),
    fileName: `${createdAtISOString.slice(0, 10)} ${gptName} Gespräch über ${conversationName}.docx`,
  };
}

export function getLastAssistantModelName(messages: ConversationDownloadData['messages']) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant' && message.modelName !== undefined) {
      return message.modelName;
    }
  }
}

export default function DownloadConversationButton({
  characterName,
  disabled = true,
  showText = false,
  className,
}: DownloadConversationButtonProps) {
  const { data } = useConversationDownload();
  const [isLoading, setIsLoading] = React.useState(false);
  const toast = useToast();
  const tCommon = useTranslations('common');
  const isDisabled = disabled || data === undefined;

  async function handleDownload() {
    if (isDisabled) {
      return;
    }
    try {
      setIsLoading(true);

      const { blob, fileName } = await fetchConversationDownload({
        messages: data.messages,
        fileMapping: data.fileMapping,
        createdAt: data.createdAt,
        conversationTitle: data.conversationTitle,
        characterName,
        modelName: getLastAssistantModelName(data.messages),
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
      disabled={isDisabled}
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
