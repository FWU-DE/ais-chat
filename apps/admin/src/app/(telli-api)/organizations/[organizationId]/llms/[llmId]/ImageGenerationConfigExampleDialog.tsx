'use client';

import type { ImageGenerationConfig } from '@ais-chat/api-database/types';
import { JsonExamplesDialog } from './JsonExamplesDialog';

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
  return (
    <JsonExamplesDialog
      triggerLabel="Beispiel anzeigen"
      title="Beispiel für Bildgenerierungs-Konfiguration"
      examples={[imageGenerationConfigExample]}
    />
  );
}
