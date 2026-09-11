'use client';

import React from 'react';
import StopWatchDoneIcon from '@/components/icons/stopwatch-done';
import DownloadSharedConversationButton, {
  type SharedConversationMessage,
} from '@/app/(unauth)/ua/download-shared-conversation-button';
import { useTranslations } from 'next-intl';
import { Button } from '@ui/components/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@ui/components/alert-dialog';
import { ArrowClockwiseIcon } from '@phosphor-icons/react';

type ExpiredChatModalProps = {
  conversationMessages: SharedConversationMessage[];
  title: string;
  inviteCode: string;
  sharedSessionId: string;
  handleRetry: () => void;
};

export default function ExpiredChatModal({
  conversationMessages,
  title,
  inviteCode,
  sharedSessionId,
  handleRetry,
}: ExpiredChatModalProps) {
  const t = useTranslations('sharing');
  const tCommon = useTranslations('common');
  const hasUserMessages = conversationMessages.some((message) => message.role === 'user');

  return (
    <AlertDialog open={true}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <StopWatchDoneIcon className="text-dark-red" />
          </AlertDialogTitle>
          <AlertDialogDescription className="text-3xl w-full text-center">
            {t('expired-modal-description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="items-center sm:justify-center">
          {/* If the shared chat has expired, the messages are gone, so there is no way atm to download the conversation. */}
          <div className="flex flex-col items-center gap-4">
            {hasUserMessages && (
              <DownloadSharedConversationButton
                primaryButton
                characterName={title}
                conversationMessages={conversationMessages}
                disabled={false}
                inviteCode={inviteCode}
                sharedSessionId={sharedSessionId}
              />
            )}
            <Button onClick={handleRetry}>
              <ArrowClockwiseIcon className="size-5" />
              {tCommon('retry-button')}
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
