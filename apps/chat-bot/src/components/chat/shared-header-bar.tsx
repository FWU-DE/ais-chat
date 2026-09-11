'use client';

import useBreakpoints from '../hooks/use-breakpoints';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/tailwind';
import DownloadSharedConversationButton, {
  fetchSharedConversationDownload,
  type SharedConversationMessage,
} from '@/app/(unauth)/ua/download-shared-conversation-button';
import { downloadFileFromBlob } from '@/utils/files/blob-download';
import Image from 'next/image';
import ProfileMenu from '../navigation/profile-menu';
import {
  ThreeDotsProfileMenu,
  type ThreeDotsProfileMenuItem,
} from '../navigation/three-dots-profile-menu';
import { type ChatMessage as Message } from '@/types/chat';
import { reductionBreakpoint } from '@/utils/tailwind/layout';
import { ConfirmAlertDialog, useConfirmAlertDialog } from '@ui/components/alert-dialog';
import { Button } from '@ui/components/button';
import { BoxArrowDownIcon, TrashSimpleIcon } from '@phosphor-icons/react';
import { useToast } from '@/components/common/toast';
import React from 'react';

export function SharedChatHeader({
  chatActive,
  hasMessages,
  t,
  handleOpenNewChat,
  title,
  messages,
  imageSource,
  dialogStarted,
  inviteCode,
  sharedSessionId,
  pendingFileMapping,
}: {
  chatActive: boolean;
  hasMessages: boolean;
  t: ReturnType<typeof useTranslations>;
  handleOpenNewChat: () => void;
  title: string;
  messages: Message[];
  imageSource?: string;
  dialogStarted: boolean;
  inviteCode: string;
  sharedSessionId?: string;
  pendingFileMapping?: Map<string, { id: string }[]>;
}) {
  const { isBelow } = useBreakpoints();
  const tCommon = useTranslations('common');
  const { dialogProps: deleteDialogProps, confirm: confirmDelete } = useConfirmAlertDialog();
  const toast = useToast();

  const showCompactHeader = isBelow[reductionBreakpoint];
  const messagesWithFiles: SharedConversationMessage[] = messages.map((message) => ({
    ...message,
    files: pendingFileMapping?.get(message.id)?.map((file) => ({ id: file.id })) ?? [],
  }));

  const openDeleteConfirm = React.useCallback(() => {
    confirmDelete(handleOpenNewChat);
  }, [confirmDelete, handleOpenNewChat]);

  const customMenuItems: ThreeDotsProfileMenuItem[] = [
    {
      id: 'delete-chat',
      label: tCommon('delete'),
      icon: <TrashSimpleIcon className="size-5 text-primary" />,
      onSelect: openDeleteConfirm,
    },
    {
      id: 'download-chat',
      label: tCommon('conversation-download'),
      icon: <BoxArrowDownIcon className="size-5 text-primary" />,
      disabled: !chatActive || !hasMessages,
      onSelect: async () => {
        if (!chatActive || !hasMessages) {
          return;
        }

        try {
          const { blob, fileName } = await fetchSharedConversationDownload({
            conversationMessages: messagesWithFiles,
            sharedConversationName: title,
            inviteCode,
            sharedSessionId,
          });

          downloadFileFromBlob(blob, fileName);
        } catch {
          toast.error('Der Download der Konversation ist fehlgeschlagen.');
        }
      },
    },
  ];

  return (
    <header
      className={cn(
        'flex gap-4 justify-between items-center py-[1.15rem] px-2',
        isBelow[reductionBreakpoint] && 'justify-start',
      )}
    >
      {!showCompactHeader && (
        <Button
          variant="ghost"
          size="icon-round"
          className="text-primary"
          onClick={openDeleteConfirm}
          data-testid="custom-chat-delete-button"
        >
          <TrashSimpleIcon className="size-5 text-primary" />
        </Button>
      )}
      <div className="grow"></div>
      <span className="flex justify-start text-xl text-ellipsis truncate items-center gap-2">
        {dialogStarted && imageSource && (
          <Image
            src={imageSource ?? ''}
            alt={title}
            width={30}
            height={30}
            className="rounded-enterprise-sm"
            unoptimized
          />
        )}
        {dialogStarted && <span className="truncate">{title}</span>}
      </span>
      <div className="grow"></div>

      {!showCompactHeader ? (
        <>
          <DownloadSharedConversationButton
            conversationMessages={messagesWithFiles}
            disabled={!chatActive || !hasMessages}
            sharedConversationName={title}
            showText={false}
            inviteCode={inviteCode}
            sharedSessionId={sharedSessionId}
          />
          <ProfileMenu userAndContext={undefined} />
        </>
      ) : (
        <ThreeDotsProfileMenu customItems={customMenuItems} />
      )}
      <ConfirmAlertDialog
        title={t('delete-chat-modal-title')}
        description={t('delete-chat-modal-description')}
        confirmLabel={t('delete-chat-modal-confirm-button')}
        cancelLabel={tCommon('cancel')}
        {...deleteDialogProps}
      />
    </header>
  );
}
