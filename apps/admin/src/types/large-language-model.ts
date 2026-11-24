import type { ReasoningConfig } from '@ais-chat/api-database/types';
import { LlmModelPriceMetadata } from '@ais-chat/shared/db/schema';

export type LargeLanguageModel = {
  id: string;
  provider: string;
  name: string;
  displayName: string;
  description: string;
  setting: object;
  priceMetadata: LlmModelPriceMetadata;
  createdAt: Date;
  supportedImageFormats: string[];
  imageGenerationConfig: object | null;
  modelConfig: object | null;
  additionalParameters: object;
  vendor: string | null;
  reasoning: ReasoningConfig | null;
  isNew: boolean;
  isDeleted: boolean;
  useBifrost: boolean;
  safetyFilterEnabled: boolean;
};

export type CreateLargeLanguageModel = {
  name: string;
  displayName: string;
  description?: string;
  priceMetadata: string;
  supportedImageFormats?: string;
  imageGenerationConfig?: string;
  modelConfig?: string;
  additionalParameters?: string;
  vendor?: string | null;
  reasoning?: ReasoningConfig | null;
  isNew: boolean;
  isDeleted: boolean;
  useBifrost: boolean;
  safetyFilterEnabled: boolean;
  providerKeys: Array<{ providerKeyId: string; upstreamModelName: string }>;
};

export type UpdateLargeLanguageModel = {
  name: string;
  displayName: string;
  description?: string;
  priceMetadata: string;
  supportedImageFormats?: string;
  imageGenerationConfig?: string;
  modelConfig?: string;
  additionalParameters?: string;
  vendor?: string | null;
  reasoning?: ReasoningConfig | null;
  isNew: boolean;
  isDeleted: boolean;
  useBifrost: boolean;
  safetyFilterEnabled: boolean;
  providerKeys: Array<{ providerKeyId: string; upstreamModelName: string }>;
};
