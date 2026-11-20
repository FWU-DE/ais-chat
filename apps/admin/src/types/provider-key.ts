import type { LlmProviderKeyWithModels } from '@ais-chat/api-database';

export type ProviderKey = LlmProviderKeyWithModels;

export type SaveProviderKey = {
  name: string;
  provider: string;
  settings: string;
  weight: number;
  isEnabled: boolean;
};
