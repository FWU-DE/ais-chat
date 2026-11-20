import { LlmInsertModel, ProjectInsertModel } from '@ais-chat/api-database';

export const PROJECT_ID = '6ecd4f8a-9576-5d5b-af0d-fc4cbce5d6e8';
export const API_KEY_ID = '7fde5f9b-a687-6e6c-bf1e-ad5dcdf6e7f9';
export const MODEL_ID = '1ead3e7f-8464-4b49-9e8b-da2aabcfe4bf';
export const NON_EXISTING_MODEL_ID = 'e88f53c4-1d88-452d-9f14-6a7d895da9f3';
export const NON_EXISTING_API_KEY_ID = '8aef6b0c-b798-7f7d-cf2f-be6ede7f8a0b';

export const testProject: ProjectInsertModel = {
  id: PROJECT_ID,
  name: 'Test Project',
};

export const testModel: LlmInsertModel = {
  id: MODEL_ID,
  name: 'Test LLM',
  displayName: 'Test LLM',
  description: 'Test LLM Description',
  provider: 'openai',
  priceMetadata: {
    type: 'text',
    completionTokenPrice: 1,
    promptTokenPrice: 1,
  },
  setting: {
    apiKey: 'sk-test',
    baseUrl: 'https://api.openai.com/v1',
    provider: 'openai',
  },
  isNew: true,
  isDeleted: false,
  useBifrost: true,
};
