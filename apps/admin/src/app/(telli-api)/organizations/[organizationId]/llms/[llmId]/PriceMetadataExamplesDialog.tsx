'use client';

import { generateLlmModelPriceMetadataExamples } from './generate-llm-model-price-metadata-examples';
import { JsonExamplesDialog } from './JsonExamplesDialog';

const examples = generateLlmModelPriceMetadataExamples();

export function PriceMetadataExamplesDialog() {
  return (
    <JsonExamplesDialog
      triggerLabel="Beispiele anzeigen"
      title="Beispiele für Preis-Metadaten"
      examples={examples}
    />
  );
}
