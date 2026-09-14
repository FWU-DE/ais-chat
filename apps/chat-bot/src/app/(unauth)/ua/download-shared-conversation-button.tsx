'use client';

import React from 'react';
import Spinner from '@/components/icons/spinner';
import { useToast } from '@/components/common/toast';
import { useTranslations } from 'next-intl';
import { type ChatMessage as Message } from '@/types/chat';
import { Button } from '@ui/components/button';
import { BoxArrowDownIcon } from '@phosphor-icons/react';
import { downloadFileFromBlob, extractFilenameFromResponse } from '@/utils/files/blob-download';
import { loadSharedChat } from '@/utils/shared-chat-storage';

type DownloadConversationButtonProps = {
  conversationMessages: Message[];
  className?: React.ComponentProps<'button'>['className'];
  disabled: boolean;
  primaryButton?: boolean;
  sharedConversationName?: string;
  characterName?: string;
  showText?: boolean;
  inviteCode: string;
  sharedSessionId?: string;
};

type DownloadSharedConversationParams = {
  conversationMessages: Message[];
  sharedConversationName?: string;
  characterName?: string;
  inviteCode: string;
  sharedSessionId?: string;
};

export async function fetchSharedConversationDownload({
  conversationMessages,
  sharedConversationName,
  characterName,
  inviteCode,
  sharedSessionId,
}: DownloadSharedConversationParams) {
  const storedChat = loadSharedChat(inviteCode);
  const filesByMessageId = new Map(
    storedChat?.messages.map((message) => [message.id, message.files]) ?? [],
  );
  const messagesWithFiles = conversationMessages.map((message) => ({
    ...message,
    files: filesByMessageId.get(message.id)?.map((file) => ({ id: file.id })) ?? [],
  }));

  const response = await fetch(`/api/download-conversation/shared`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: messagesWithFiles,
      characterName,
      sharedConversationName,
      inviteCode,
      sharedSessionId,
    }),
  });

  const fileName = extractFilenameFromResponse(response, 'Konversation_AIS.chat.docx');

  if (!response.ok) {
    throw new Error('Failed to download the document');
  }

  return {
    blob: await response.blob(),
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
  inviteCode,
  sharedSessionId,
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
        inviteCode,
        sharedSessionId,
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
