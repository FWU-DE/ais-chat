import type { LlmModel } from '@ais-chat/api-database';
import { describe, expect, it } from 'vitest';

import { obscureModels } from './utils';

const baseModel: LlmModel = {
  id: 'model-1',
  provider: 'openai',
  name: 'gpt-4',
  displayName: 'GPT-4',
  description: 'A test model',
  setting: { apiKey: 'sk-secret', baseUrl: 'https://api.openai.com/v1', provider: 'openai' },
  priceMetadata: { type: 'text', completionTokenPrice: 1, promptTokenPrice: 1 },
  createdAt: new Date('2025-01-01'),
  supportedImageFormats: [],
  imageGenerationConfig: null,
  modelConfig: null,
  additionalParameters: {},
  isNew: false,
  isDeleted: false,
  useBifrost: true,
  safetyFilterEnabled: true,
};

describe('obscureModels', () => {
  it('removes setting from each model', () => {
    const result = obscureModels([baseModel]);
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('setting');
  });

  it('preserves all other model fields', () => {
    const [obscured] = obscureModels([baseModel]);
    expect(obscured).toMatchObject({
      id: 'model-1',
      name: 'gpt-4',
      displayName: 'GPT-4',
      provider: 'openai',
      description: 'A test model',
    });
  });

  it('returns empty array for empty input', () => {
    expect(obscureModels([])).toEqual([]);
  });
});
