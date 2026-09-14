import { z } from 'zod';
import {
  llmModelPriceMetadataSchema,
  type LlmModelPriceMetadata,
} from '@ais-chat/shared-core/schemas/llm-model-price-metadata';

/**
 * Generates one minimal example object per variant of
 * `llmModelPriceMetadataSchema`, for display in the admin UI so users know
 * which shape to paste into the `priceMetadata` JSON field.
 */
export function generateLlmModelPriceMetadataExamples(): LlmModelPriceMetadata[] {
  return llmModelPriceMetadataSchema.def.options.map(
    (option) => buildExampleFromShape(option.shape) as LlmModelPriceMetadata,
  );
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
