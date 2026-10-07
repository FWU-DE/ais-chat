'use client';

import { type ReactElement, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/common/toast';
import { CommunityTemplateRequestMutationResult } from '@/hooks/use-community-template-request';
import { Button } from '@ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ui/components/dialog';
import { Textarea } from '@ui/components/textarea';

type CommunityTemplateMessageDialogProps = {
  trigger: ReactElement;
  onSendMessage: (message: string) => Promise<CommunityTemplateRequestMutationResult>;
};

export function CommunityTemplateMessageDialog({
  trigger,
  onSendMessage,
}: CommunityTemplateMessageDialogProps) {
  const t = useTranslations('community-sharing');
  const tCommon = useTranslations('common');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const isMessageEmpty = message.trim().length === 0;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setMessage('');
    }
  }

  async function handleSend() {
    setIsSending(true);
    const result = await onSendMessage(message);
    setIsSending(false);

    if (!result.success) {
      toast.error(t('toasts.send-message-toast-error'));
      return;
    }
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('message-dialog.title')}</DialogTitle>
        </DialogHeader>
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          aria-label={t('message-dialog.message-label')}
          placeholder={t('message-dialog.message-placeholder')}
          required
          aria-required
          disabled={isSending}
          className="min-h-32"
          data-testid="community-template-message-input"
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button
              variant="outline"
              disabled={isSending}
              data-testid="community-template-message-cancel"
            >
              {tCommon('cancel')}
            </Button>
          </DialogClose>
          <Button
            disabled={isSending || isMessageEmpty}
            onClick={() => void handleSend()}
            data-testid="community-template-message-send"
          >
            {t('message-dialog.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
