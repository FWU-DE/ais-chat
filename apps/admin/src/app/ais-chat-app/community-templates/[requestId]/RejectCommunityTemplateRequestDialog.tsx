'use client';

import { ConfirmationDialog } from '@ui/components/dialog/confirmation-dialog';
import { Button } from '@ui/components/button';
import { PencilSimpleIcon } from '@phosphor-icons/react';
import { Textarea } from '@ui/components/textarea';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { rejectRequestAction } from './actions';

export type RejectCommunityTemplateRequestDialogProps = {
  requestId: string;
  onRejected: () => Promise<void>;
};

export default function RejectCommunityTemplateRequestDialog({
  requestId,
  onRejected,
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

  return (
    <ConfirmationDialog
      trigger={
        <Button>
          <PencilSimpleIcon /> Überarbeitung anfordern
        </Button>
      }
      content={
        <Textarea
          ref={focusMessageTextarea}
          className="h-30"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      }
      title="Überarbeitung anfordern"
      description="Welche Änderungen sollen vom Autor/Autorin vorgenommen werden?"
      cancelLabel="Abbrechen"
      confirmLabel="Senden"
      onConfirm={async () => {
        const result = await rejectRequestAction(requestId, message);
        if (result.success) {
          setMessage('');
          await onRejected();
        } else {
          toast.error(result.error.message);
        }
      }}
    />
  );
}
