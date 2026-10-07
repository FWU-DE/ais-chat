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

export const speechVoiceSchema = z.object({
  name: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
});

export const speechConfigSchema = z.object({
  voices: z.array(speechVoiceSchema),
});

export type SpeechVoice = z.infer<typeof speechVoiceSchema>;
export type SpeechConfig = z.infer<typeof speechConfigSchema>;
