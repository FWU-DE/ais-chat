'use client';

import { ShieldWarningIcon } from '@phosphor-icons/react';
import { EntityRef } from '@shared/entities/entity-types';
import { Button } from '@ui/components/button';
import { useMessages } from 'next-intl';

import { CustomChatCreateSuspensionDialog } from './custom-chat-create-suspension-dialog';

type CustomChatCreateSuspensionRequestProps = {
  entityRef: EntityRef;
};

export function CustomChatCreateSuspensionRequestButton({
  entityRef,
}: CustomChatCreateSuspensionRequestProps) {
  const messages = useMessages();
  const { entityType } = entityRef;

  return (
    <div className="flex justify-center">
      <CustomChatCreateSuspensionDialog
        entityRef={entityRef}
        trigger={
          <Button variant="link" className="text-sm">
            <ShieldWarningIcon />
            {messages.suspension[entityType]['create-button-text']}
          </Button>
        }
      />
    </div>
  );
}
