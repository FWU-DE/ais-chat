import { z } from 'zod';

export const imageSizeSchema = z.union([z.literal('auto'), z.string().regex(/^\d+x\d+$/)]);

export const imageGenerationConfigSchema = z.object({
  aspectRatio: z.object({
    quadratic: imageSizeSchema,
    landscape: imageSizeSchema,
    portrait: imageSizeSchema,
  }),
});

export type ImageGenerationConfig = z.infer<typeof imageGenerationConfigSchema>;

export const llmModelPriceMetadataSchema = z.union([
  z.object({
    type: z.literal('text'),
    completionTokenPrice: z.number(),
    promptTokenPrice: z.number(),
  }),
  z.object({
    type: z.literal('image'),
    pricePerImageInCent: z.number(),
  }),
  z.object({
    type: z.literal('image'),
    inputTextTokenPrice: z.number(),
    outputTextTokenPrice: z.number().optional(),
    outputImageTokenPrice: z.number(),
  }),
  z.object({
    type: z.literal('embedding'),
    promptTokenPrice: z.number(),
  }),
  z.object({
    type: z.literal('safety'),
    promptTokenPrice: z.number(),
  }),
]);

export type LlmModelPriceMetadata = z.infer<typeof llmModelPriceMetadataSchema>;
