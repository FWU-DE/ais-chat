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
import { generateLlmModelPriceMetadataExamples } from './generate-llm-model-price-metadata-examples';

const examples = generateLlmModelPriceMetadataExamples();

export function PriceMetadataExamplesDialog() {
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  async function handleCopy(label: string, example: unknown) {
    await navigator.clipboard.writeText(JSON.stringify(example, null, 2));
    setCopiedLabel(label);
    setTimeout(() => setCopiedLabel((current) => (current === label ? null : current)), 1500);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="link" className="h-auto p-0 text-xs">
          Beispiele anzeigen
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton className="max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Beispiele für Preis-Metadaten</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {examples.map(({ label, example }) => (
            <div key={label} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{label}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(label, example)}
                >
                  {copiedLabel === label ? <CheckIcon /> : <CopyIcon />}
                  Kopieren
                </Button>
              </div>
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
