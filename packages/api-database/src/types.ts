import { z } from 'zod';

export {
  type LlmModelPriceMetadata,
  llmModelPriceMetadataSchema,
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
  // Opt-in for Azure AI Speech (`{endpoint}/tts/cognitiveservices/v1`). Azure OpenAI TTS
  // deployments are speech models too, but must keep the Azure OpenAI deployment route.
  useAzureSpeechEndpoint: z.boolean().optional(),
});

export type SpeechVoice = z.infer<typeof speechVoiceSchema>;
export type SpeechConfig = z.infer<typeof speechConfigSchema>;

/**
 * Model fields exposed by the API. Parsing strips everything else, such as provider settings and
 * internal speech config. Stored values are passed through as they are, so legacy data can't break
 * the model listing.
 */
export const llmModelPublicSchema = z.object({
  id: z.string(),
  provider: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  priceMetadata: z.unknown(),
  createdAt: z.date(),
  supportedImageFormats: z.array(z.string()),
  imageGenerationConfig: z.unknown(),
  modelConfig: speechConfigSchema.pick({ voices: true }).nullable(),
  additionalParameters: z.unknown(),
  isNew: z.boolean(),
  isDeleted: z.boolean(),
  useBifrost: z.boolean(),
  safetyFilterEnabled: z.boolean(),
});
