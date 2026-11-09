'use client';

import type { SpeechConfig } from '@ais-chat/api-database/types';

import { JsonExamplesDialog } from './JsonExamplesDialog';

const azureSpeechConfigExample: SpeechConfig = {
  voices: [
    { name: 'de-DE-Katja', displayName: 'Katja (weiblich)' },
    { name: 'de-DE-Conrad', displayName: 'Conrad (männlich)' },
  ],
  useAzureSpeechEndpoint: true,
};

export function ModelConfigExampleDialog() {
  return (
    <JsonExamplesDialog
      triggerLabel="Beispiel anzeigen"
      title="Beispiel für Modell-Konfiguration"
      examples={[azureSpeechConfigExample]}
    />
  );
}
