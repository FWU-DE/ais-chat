'use client';

import { PencilSimpleIcon } from '@phosphor-icons/react';
import { TemplateRequestStatus } from '@shared/db/schema';
import { Button } from '@ui/components/button';
import { ConfirmationDialog } from '@ui/components/dialog/confirmation-dialog';
import { Textarea } from '@ui/components/textarea';
import { useCallback, useState } from 'react';

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
        <Button disabled={!isRejectPossible}>
          <PencilSimpleIcon /> Überarbeitung anfordern
        </Button>
      }
      content={
        <Textarea
          ref={focusMessageTextarea}
          className="min-h-30 max-h-[50vh] overflow-y-auto"
          aria-label="Nachricht an Autor/Autorin"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      }
      title="Überarbeitung anfordern"
      description="Welche Änderungen sollen vom Autor/Autorin vorgenommen werden?"
      cancelLabel="Abbrechen"
      confirmLabel="Senden"
      onConfirm={async () => {
        const success = await onReject(message);
        if (success) {
          setMessage('');
        }
      }}
    />
  );
}
