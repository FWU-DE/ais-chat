import { z } from 'zod';

// Single source of truth for the shape of an LLM model's `priceMetadata`.
// Two variants share `type: 'image'` (distinguished by their fields), so this
// stays a plain union rather than a discriminated union. Each variant is
// `.strict()` so mixed/extra fields (e.g. both `pricePerImageInCent` and
// token-based fields) are rejected instead of silently matching the first
// variant and dropping the rest via Zod's default strip-unknown behavior.
export const llmModelPriceMetadataSchema = z.union([
  z
    .object({
      type: z.literal('text'),
      completionTokenPrice: z.number(),
      promptTokenPrice: z.number(),
    })
    .strict(),
  z
    .object({
      type: z.literal('image'),
      pricePerImageInCent: z.number(),
    })
    .strict(),
  z
    .object({
      type: z.literal('image'),
      inputTextTokenPrice: z.number(),
      outputTextTokenPrice: z.number().optional(),
      outputImageTokenPrice: z.number(),
    })
    .strict(),
  z
    .object({
      type: z.literal('embedding'),
      promptTokenPrice: z.number(),
    })
    .strict(),
  z
    .object({
      type: z.literal('safety'),
      promptTokenPrice: z.number(),
    })
    .strict(),
]);

export type LlmModelPriceMetadata = z.infer<typeof llmModelPriceMetadataSchema>;
