'use client';

import React from 'react';

import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

type SimpleInputDialogProps<T extends Record<string, unknown>> = {
  trigger: React.ReactElement;
  title: string;
  description: string;
  initialValues: T;
  content: (values: T, onChange: (values: T) => void) => React.ReactNode;
  onSubmit: (values: T) => Promise<void>;
  cancelButtonText?: string;
  submitButtonText?: string;
};

export function SimpleInputDialog<T extends Record<string, unknown>>({
  trigger,
  title,
  description,
  initialValues,
  content,
  onSubmit,
  cancelButtonText = 'Abbrechen',
  submitButtonText = 'Speichern',
}: SimpleInputDialogProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<T>(initialValues);

  async function handleSubmitButtonClicked() {
    try {
      // error handling is the responsibility of the caller
      await onSubmit(values);
      setOpen(false);
    } catch {
      // keep dialog open
    }
  }

  function handleOpenChanged(isOpen: boolean) {
    setOpen(isOpen);
    // reset values on open to initial values
    if (isOpen) {
      setValues(initialValues);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChanged}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmitButtonClicked();
          }}
        >
          <div className="overflow-y-auto mb-8">{content(values, setValues)}</div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{cancelButtonText}</Button>
            </DialogClose>
            <Button type="submit">{submitButtonText}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
