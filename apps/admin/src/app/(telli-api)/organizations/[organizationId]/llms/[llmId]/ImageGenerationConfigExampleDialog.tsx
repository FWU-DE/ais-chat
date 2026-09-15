'use client';

import { useState } from 'react';
import { CheckIcon, CopyIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ui/components/dialog';
import type { ImageGenerationConfig } from '@ais-chat/api-database/types';

// Typed as `ImageGenerationConfig` so schema changes force this example to be
// kept in sync (TS error on missing/renamed fields).
const imageGenerationConfigExample: ImageGenerationConfig = {
  aspectRatio: {
    quadratic: '1024x1024',
    landscape: '1536x1024',
    portrait: '1024x1536',
  },
};

export function ImageGenerationConfigExampleDialog() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(JSON.stringify(imageGenerationConfigExample, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="link" className="h-auto p-0 text-xs">
          Beispiel anzeigen
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton className="max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Beispiel für Bildgenerierungs-Konfiguration</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={handleCopy}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            Kopieren
          </Button>
          <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
            {JSON.stringify(imageGenerationConfigExample, null, 2)}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
