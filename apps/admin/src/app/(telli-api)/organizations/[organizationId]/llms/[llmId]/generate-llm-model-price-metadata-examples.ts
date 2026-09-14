import { z } from 'zod';
import {
  llmModelPriceMetadataSchema,
  type LlmModelPriceMetadata,
} from '@ais-chat/shared-core/schemas/llm-model-price-metadata';

// Human-readable labels for each variant, in schema order. The two `type:
// 'image'` variants are disambiguated by their pricing model.
const LLM_MODEL_PRICE_METADATA_VARIANT_LABELS = [
  'Text',
  'Bild (Preis pro Bild)',
  'Bild (Token-basiert)',
  'Embedding',
  'Safety',
] as const;

/**
 * Generates one minimal example object per variant of
 * `llmModelPriceMetadataSchema`, for display in the admin UI so users know
 * which shape to paste into the `priceMetadata` JSON field.
 */
export function generateLlmModelPriceMetadataExamples(): Array<{
  label: string;
  example: LlmModelPriceMetadata;
}> {
  const options = llmModelPriceMetadataSchema.def.options;
  return options.map((option, index) => ({
    label: LLM_MODEL_PRICE_METADATA_VARIANT_LABELS[index] ?? `Variante ${index + 1}`,
    example: buildExampleFromShape(option.shape) as LlmModelPriceMetadata,
  }));
}

function buildExampleFromShape(shape: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(shape).map(([key, field]) => [key, buildExampleValue(field as z.ZodType)]),
  );
}

function buildExampleValue(field: z.ZodType): unknown {
  const unwrapped = field instanceof z.ZodOptional ? field.unwrap() : field;
  if (unwrapped instanceof z.ZodLiteral) {
    return [...unwrapped.values][0];
  }
  if (unwrapped instanceof z.ZodNumber) {
    return 0.0001;
  }
  return null;
}
