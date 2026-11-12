import { CopyIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';

import { ConfirmationDialog } from '../common/dialog';

export function CustomChatActionDuplicate({ onClick }: { onClick: () => void }) {
  const t = useTranslations('custom-chat');

  return (
    <ConfirmationDialog
      trigger={
        <Button variant="outline" type="button" data-testid="custom-chat-duplicate-button">
          <CopyIcon className="size-5" />
          {t('duplicate')}
        </Button>
      }
      title={t('duplicate-dialog.title')}
      description={t('duplicate-dialog.description')}
      cancelLabel={t('duplicate-dialog.cancel')}
      confirmLabel={t('duplicate-dialog.confirm')}
      confirmTestId="custom-chat-confirm-button"
      onConfirm={onClick}
    />
  );
}
