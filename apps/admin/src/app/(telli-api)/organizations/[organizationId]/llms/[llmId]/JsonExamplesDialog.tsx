'use client';

import { useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '@ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ui/components/dialog';

export type JsonExamplesDialogProps = {
  triggerLabel: string;
  title: string;
  examples: unknown[];
};

export function JsonExamplesDialog({ triggerLabel, title, examples }: JsonExamplesDialogProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleCopy(index: number, example: unknown) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(example, null, 2));
    } catch {
      toast.error('Kopieren in die Zwischenablage fehlgeschlagen');
      return;
    }
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    setCopiedIndex(index);
    copiedTimeoutRef.current = setTimeout(() => setCopiedIndex(null), 1500);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="link" className="h-auto p-0 text-xs">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton className="max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {examples.map((example, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => handleCopy(index, example)}
              >
                {copiedIndex === index ? <CheckIcon /> : <CopyIcon />}
                Kopieren
              </Button>
              <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
                {JSON.stringify(example, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
