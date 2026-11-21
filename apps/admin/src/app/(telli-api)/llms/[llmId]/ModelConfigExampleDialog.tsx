'use client';

import type { SpeechConfig } from '@ais-chat/api-database/types';

import { JsonExamplesDialog } from './JsonExamplesDialog';

const azureSpeechConfigExample: SpeechConfig = {
  voices: [
    // SSML rewrite uses <lang>, which only multilingual voices support.
    { name: 'de-DE-Seraphina:DragonHDLatestNeural', displayName: 'Seraphina (weiblich)' },
    { name: 'de-DE-Florian:DragonHDLatestNeural', displayName: 'Florian (männlich)' },
  ],
  useAzureSpeechEndpoint: true,
  enableSsmlRewrite: true,
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
