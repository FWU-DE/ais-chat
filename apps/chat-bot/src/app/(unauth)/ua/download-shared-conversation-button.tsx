'use client';

import type { ConversationDownloadFile } from '@/components/chat/conversation-download-context';
import { useToast } from '@/components/common/toast';
import Spinner from '@/components/icons/spinner';
import { type ChatMessage as Message } from '@/types/chat';
import { downloadFileFromBlob } from '@/utils/files/blob-download';
import {
  createConversationExportMessages,
  formatConversationExport,
  markdownToDocxBlob,
} from '@/utils/files/markdown-docx';
import { BoxArrowDownIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import React from 'react';

type DownloadConversationButtonProps = {
  conversationMessages: Message[];
  className?: React.ComponentProps<'button'>['className'];
  disabled: boolean;
  primaryButton?: boolean;
  sharedConversationName?: string;
  characterName?: string;
  showText?: boolean;
  fileMapping: Map<string, ConversationDownloadFile[]>;
};

type DownloadSharedConversationParams = {
  conversationMessages: Message[];
  sharedConversationName?: string;
  characterName?: string;
  fileMapping: Map<string, ConversationDownloadFile[]>;
};

export async function fetchSharedConversationDownload({
  conversationMessages,
  sharedConversationName,
  characterName,
  fileMapping,
}: DownloadSharedConversationParams) {
  const messages = createConversationExportMessages({
    messages: conversationMessages,
    fileMapping,
  });
  const fileName = `${new Date().toISOString().slice(0, 10)}-AIS.chat-Konversation.docx`;

  return {
    blob: await markdownToDocxBlob(
      formatConversationExport({
        messages,
        createdAt: new Date().toISOString(),
        modelName: 'AIS.chat',
        conversationTitle: sharedConversationName ?? characterName,
      }),
      { exportImages: true },
    ),
    fileName,
  };
}

export default function DownloadSharedConversationButton({
  conversationMessages,
  disabled = true,
  primaryButton,
  sharedConversationName,
  characterName,
  showText = true,
  fileMapping,
}: DownloadConversationButtonProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const isMountedRef = React.useRef(true);
  const toast = useToast();
  const tCommon = useTranslations('common');

  React.useEffect(() => {
    // In dev with React StrictMode, effects may run setup/cleanup twice.
    // Keep this ref accurate so async callbacks don't call setState after unmount.
    isMountedRef.current = true;

    return () => {
      // Component can be unmounted before the download is completed
      isMountedRef.current = false;
    };
  }, []);

  async function handleDownload() {
    if (disabled) {
      return;
    }

    try {
      setIsLoading(true);

      const { blob, fileName } = await fetchSharedConversationDownload({
        conversationMessages,
        sharedConversationName,
        characterName,
        fileMapping,
      });

      downloadFileFromBlob(blob, fileName);
    } catch {
      toast.error('Der Download der Konversation ist fehlgeschlagen.');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }

  if (primaryButton) {
    return (
      <Button
        variant={showText ? 'outline' : 'ghost'}
        size={showText ? 'default' : 'icon-round'}
        className="text-primary"
        title={tCommon('conversation-download')}
        onClick={handleDownload}
        disabled={disabled}
      >
        <div className="flex items-center gap-1">
          {isLoading ? (
            <Spinner className="p-2 size-8" />
          ) : (
            <BoxArrowDownIcon className="size-6 text-primary" />
          )}
          {showText && tCommon('conversation-download')}
        </div>
      </Button>
    );
  }

  return (
    <Button
      variant={showText ? 'outline' : 'ghost'}
      size={showText ? 'default' : 'icon-round'}
      className="text-primary"
      title={tCommon('conversation-download')}
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
