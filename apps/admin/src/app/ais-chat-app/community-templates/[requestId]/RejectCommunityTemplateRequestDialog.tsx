'use client';

import { ConfirmationDialog } from '@ui/components/dialog/confirmation-dialog';
import { Button } from '@ui/components/button';
import { PencilSimpleIcon } from '@phosphor-icons/react';
import { Textarea } from '@ui/components/textarea';
import { useCallback, useState } from 'react';
import { TemplateRequestStatus } from '@shared/db/schema';

export type RejectCommunityTemplateRequestDialogProps = {
  requestState: TemplateRequestStatus;
  onReject: (message: string) => Promise<boolean>;
};

export default function RejectCommunityTemplateRequestDialog({
  requestState,
  onReject,
}: RejectCommunityTemplateRequestDialogProps) {
  const [message, setMessage] = useState('');
  const focusMessageTextarea = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element) {
      return;
    }

    window.requestAnimationFrame(() => {
      element.focus();
    });
  }, []);

  const isRejectPossible = requestState === 'submitted' || requestState === 'approved';

  return (
    <ConfirmationDialog
      trigger={
        <Button disabled={!isRejectPossible} data-testid="community-template-reject-button">
          <PencilSimpleIcon /> Überarbeitung anfordern
        </Button>
      }
      content={
        <Textarea
          ref={focusMessageTextarea}
          className="h-30"
          aria-label="Nachricht an Autor/Autorin"
          data-testid="community-template-reject-message-input"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      }
      title="Überarbeitung anfordern"
      description="Welche Änderungen sollen vom Autor/Autorin vorgenommen werden?"
      cancelLabel="Abbrechen"
      confirmLabel="Senden"
      cancelTestId="community-template-reject-cancel"
      confirmTestId="community-template-reject-confirm"
      onConfirm={async () => {
        const success = await onReject(message);
        if (success) {
          setMessage('');
        }
      }}
    />
  );
}
