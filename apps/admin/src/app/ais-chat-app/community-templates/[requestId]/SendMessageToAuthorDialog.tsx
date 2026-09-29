import { FloppyDiskIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { ConfirmationDialog } from '@ui/components/dialog/confirmation-dialog';
import { Textarea } from '@ui/components/textarea';
import { useCallback, useState } from 'react';

export type SendMessageToAuthorDialogProps = {
  onSendMessage: (message: string) => Promise<boolean>;
};

export default function SendMessageToAuthorDialog({
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
        const success = await onSendMessage(message);
        if (success) {
          setMessage('');
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
          aria-label="Nachricht an Autor/Autorin"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      }
    />
  );
}
