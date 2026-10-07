'use client';

import type { SpeechConfig } from '@ais-chat/api-database/types';
import { JsonExamplesDialog } from './JsonExamplesDialog';

// Typed as `SpeechConfig` so schema changes force this example to be
// kept in sync (TS error on missing/renamed fields).
const modelConfigExample: SpeechConfig = {
  voices: [
    { name: 'Leda', displayName: 'Leda (weiblich)' },
    { name: 'Sulafat', displayName: 'Sulafat (weiblich)' },
    { name: 'Puck', displayName: 'Puck (männlich)' },
    { name: 'Umbriel', displayName: 'Umbriel (männlich)' },
  ],
};

export function ModelConfigExampleDialog() {
  return (
    <JsonExamplesDialog
      triggerLabel="Beispiel anzeigen"
      title="Beispiel für Modell-Konfiguration"
      examples={[modelConfigExample]}
    />
  );
}
