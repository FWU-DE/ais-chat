'use client';

import { Button } from '@ais-chat/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ais-chat/ui/components/dialog';
import { useTranslations } from 'next-intl';
import React from 'react';

type InfoDialogProps = {
  trigger: React.ReactElement;
  title: React.ReactNode;
  description?: React.ReactNode;
  content?: React.ReactNode;
  closeLabel?: React.ReactNode;
};

export function InfoDialog({ trigger, title, description, content, closeLabel }: InfoDialogProps) {
  const [open, setOpen] = React.useState(false);
  const t = useTranslations('common');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? '' : 'sr-only'}>
            {description}
          </DialogDescription>
        </DialogHeader>
        {content && <div className="overflow-y-auto">{content}</div>}
        <DialogFooter>
          <DialogClose asChild>
            <Button>{closeLabel ?? t('close')}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
