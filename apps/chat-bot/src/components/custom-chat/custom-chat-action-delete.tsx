import { TrashSimpleIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';

import DestructiveActionButton from '@/components/common/destructive-action-button';

type CustomChatActionDeleteProps = {
  onClick: () => void;
  modalTitle: string;
  modalDescription: string;
};

export function CustomChatActionDelete({
  onClick,
  modalTitle,
  modalDescription,
}: CustomChatActionDeleteProps) {
  const t = useTranslations();

  return (
    <DestructiveActionButton
      modalTitle={modalTitle}
      modalDescription={modalDescription}
      confirmText={t('common.delete')}
      actionFn={onClick}
    >
      <TrashSimpleIcon className="size-5" />
      {t('common.delete')}
    </DestructiveActionButton>
  );
}
