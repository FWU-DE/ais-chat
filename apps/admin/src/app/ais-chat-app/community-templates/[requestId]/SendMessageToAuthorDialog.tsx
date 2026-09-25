import { FloppyDiskIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { ConfirmationDialog } from '@ui/components/dialog/confirmation-dialog';
import { Textarea } from '@ui/components/textarea';
import { useCallback, useState } from 'react';
import { sendMessageToAuthorAction } from './actions';

export type SendMessageToAuthorDialogProps = {
  requestId: string;
  onSendMessage: () => Promise<void>;
};

export default function SendMessageToAuthorDialog({
  requestId,
  onSendMessage,
}: SendMessageToAuthorDialogProps) {
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
      title="Nachricht an Autor/Autorin"
      description="Bitte geben Sie Ihre Nachricht an den Autor oder die Autorin ein."
      confirmLabel="Senden"
      cancelLabel="Abbrechen"
      onConfirm={async () => {
        const result = await sendMessageToAuthorAction(requestId, message);
        if (result.success) {
          setMessage('');
          await onSendMessage();
        }
      }}
      trigger={
        <Button>
          <FloppyDiskIcon /> Nachricht an Autor/Autorin
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
    />
  );
}
