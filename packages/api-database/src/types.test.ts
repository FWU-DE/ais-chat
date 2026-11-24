import { describe, expect, it } from 'vitest';

import {
  llmModelPublicSchema,
  REASONING_EFFORTS,
  REASONING_SUMMARIES,
  reasoningConfigSchema,
} from './types';

describe('reasoningConfigSchema', () => {
  it.each(REASONING_EFFORTS)('accepts effort %s', (effort) => {
    expect(reasoningConfigSchema.parse({ effort })).toEqual({ effort });
  });

  it.each(REASONING_SUMMARIES)('accepts summary %s', (summary) => {
    expect(reasoningConfigSchema.parse({ summary })).toEqual({ summary });
  });

  it('accepts effort and summary together and an empty object', () => {
    expect(reasoningConfigSchema.parse({ effort: 'low', summary: 'auto' })).toEqual({
      effort: 'low',
      summary: 'auto',
    });
    expect(reasoningConfigSchema.parse({})).toEqual({});
  });

  it.each([null, '', 'low', [], { effort: 'extreme' }, { effort: 'HIGH' }, { summary: 'none' }])(
    'rejects %j',
    (value) => {
      expect(reasoningConfigSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('llmModelPublicSchema reasoning', () => {
  const model = {
    id: 'id',
    provider: 'bifrost',
    name: 'name',
    displayName: 'Name',
    description: '',
    priceMetadata: {},
    createdAt: new Date(),
    supportedImageFormats: [],
    imageGenerationConfig: null,
    modelConfig: null,
    additionalParameters: {},
    isNew: false,
    isDeleted: false,
    useBifrost: true,
    safetyFilterEnabled: true,
    vendor: null,
  };

  it('passes a valid reasoning config through', () => {
    expect(
      llmModelPublicSchema.parse({ ...model, reasoning: { effort: 'low' } }).reasoning,
    ).toEqual({ effort: 'low' });
  });

  it.each([null, { effort: 'legacy' }, 'low'])('exposes %j as null instead of failing', (value) => {
    expect(llmModelPublicSchema.parse({ ...model, reasoning: value }).reasoning).toBeNull();
  });
});
