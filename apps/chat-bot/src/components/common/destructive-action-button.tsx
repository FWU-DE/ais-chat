import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import React from 'react';

import { ConfirmationDialog } from './dialog';

type DestructiveActionButtonProps = {
  triggerButtonVariant?: React.ComponentProps<typeof Button>['variant'];
  triggerButtonSize?: React.ComponentProps<typeof Button>['size'];
  triggerButtonClassName?: string;
  children: React.ReactNode;
  modalTitle: string;
  modalDescription: string;
  confirmText?: string;
  actionFn: () => void;
} & React.ComponentProps<'button'>;

export default function DestructiveActionButton({
  triggerButtonVariant = 'outline',
  triggerButtonSize,
  triggerButtonClassName,
  children,
  onClick,
  actionFn,
  modalTitle,
  modalDescription,
  confirmText,
  ...buttonProps
}: DestructiveActionButtonProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('common');

  function refetchConversations() {
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }

  return (
    <ConfirmationDialog
      trigger={
        <Button
          variant={triggerButtonVariant}
          size={triggerButtonSize}
          className={triggerButtonClassName}
          onClick={(event) => {
            event.stopPropagation();
            onClick?.(event);
          }}
          type="button"
          data-testid="custom-chat-delete-button"
          {...buttonProps}
        >
          {children}
        </Button>
      }
      title={modalTitle}
      description={modalDescription}
      confirmLabel={confirmText ?? t('delete')}
      confirmVariant="destructive"
      cancelLabel={t('cancel')}
      confirmTestId="custom-chat-confirm-button"
      onConfirm={() => {
        actionFn();
        refetchConversations();
      }}
    />
  );
}
