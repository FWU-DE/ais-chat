'use client';

import { CaretRightIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import { ReactElement } from 'react';

import { InfoDialog } from '../common/dialog';

type CustomChatInstructionsExampleDialogProps = {
  descriptionContent: ReactElement;
};

export function CustomChatInstructionsExampleDialog({
  descriptionContent,
}: CustomChatInstructionsExampleDialogProps) {
  const t = useTranslations('custom-chat.instructions-example');

  return (
    <InfoDialog
      trigger={
        <Button
          variant="link"
          type="button"
          className="text-sm font-medium h-auto p-0 leading-none gap-0 flex items-center"
          aria-label={t('button')}
        >
          {t('button')}
          <CaretRightIcon className="size-3.5 text-primary ml-1" />
        </Button>
      }
      title={t('title')}
      content={descriptionContent}
    />
  );
}
