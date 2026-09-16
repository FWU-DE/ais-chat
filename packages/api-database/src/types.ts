import { z } from 'zod';

export {
  llmModelPriceMetadataSchema,
  type LlmModelPriceMetadata,
} from '@ais-chat/shared-core/schemas/llm-model-price-metadata';

export const imageSizeSchema = z.union([z.literal('auto'), z.string().regex(/^\d+x\d+$/)]);

export const imageGenerationConfigSchema = z.object({
  aspectRatio: z.object({
    quadratic: imageSizeSchema,
    landscape: imageSizeSchema,
    portrait: imageSizeSchema,
  }),
});

export type ImageGenerationConfig = z.infer<typeof imageGenerationConfigSchema>;
