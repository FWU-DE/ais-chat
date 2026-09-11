export type LargeLanguageModel = {
  id: string;
  provider: string;
  name: string;
  displayName: string;
  description: string;
  setting: object;
  priceMetadata: object;
  organizationId: string;
  createdAt: Date;
  supportedImageFormats: string[];
  imageGenerationConfig: object | null;
  additionalParameters: object;
  isNew: boolean;
  isDeleted: boolean;
  useBifrost: boolean;
  safetyFilterEnabled: boolean;
};

export type CreateLargeLanguageModel = {
  name: string;
  displayName: string;
  description?: string;
  priceMetadata?: string;
  supportedImageFormats?: string;
  imageGenerationConfig?: string;
  additionalParameters?: string;
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
  priceMetadata?: string;
  supportedImageFormats?: string;
  imageGenerationConfig?: string;
  additionalParameters?: string;
  isNew: boolean;
  isDeleted: boolean;
  useBifrost: boolean;
  safetyFilterEnabled: boolean;
  providerKeys: Array<{ providerKeyId: string; upstreamModelName: string }>;
};
