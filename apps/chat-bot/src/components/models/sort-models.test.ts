import type { ReasoningEffort } from '@ais-chat/api-database/types';
import type { LlmModelSelectModel } from '@shared/db/schema';
import { describe, expect, it } from 'vitest';

import { sortModels, toggleModelSort } from './sort-models';

const model = (
  displayName: string,
  reasoningEffort: ReasoningEffort | null = null,
  completionTokenPrice = 0,
): LlmModelSelectModel => ({
  id: displayName,
  provider: 'test',
  name: displayName,
  displayName,
  description: '',
  priceMetadata: { type: 'text', completionTokenPrice, promptTokenPrice: 0 },
  createdAt: new Date(),
  supportedImageFormats: [],
  imageGenerationConfig: null,
  modelConfig: null,
  isNew: false,
  isDeleted: false,
  vendor: null,
  reasoning: reasoningEffort ? { effort: reasoningEffort } : null,
});

const names = (models: LlmModelSelectModel[]) => models.map((m) => m.displayName);

describe('sortModels', () => {
  it('sorts by name in both directions, ignoring case', () => {
    const models = [model('b-model'), model('A-model'), model('c-model')];
    expect(names(sortModels(models, { key: 'name', direction: 'asc' }))).toEqual([
      'A-model',
      'b-model',
      'c-model',
    ]);
    expect(names(sortModels(models, { key: 'name', direction: 'desc' }))).toEqual([
      'c-model',
      'b-model',
      'A-model',
    ]);
  });

  it('sorts reasoning by enum order with no reasoning lowest', () => {
    const models = [
      model('high', 'high'),
      model('none-effort', 'none'),
      model('unset'),
      model('xhigh', 'xhigh'),
      model('low', 'low'),
    ];
    expect(names(sortModels(models, { key: 'reasoning', direction: 'asc' }))).toEqual([
      'unset',
      'none-effort',
      'low',
      'high',
      'xhigh',
    ]);
    expect(names(sortModels(models, { key: 'reasoning', direction: 'desc' }))).toEqual([
      'xhigh',
      'high',
      'low',
      'none-effort',
      'unset',
    ]);
  });

  it('sorts by the cost factor relative to the default model', () => {
    const defaultModel = model('default', null, 100);
    const models = [model('mid', null, 50), model('free', null, 0), model('pricey', null, 500)];
    expect(names(sortModels(models, { key: 'cost', direction: 'asc' }, defaultModel))).toEqual([
      'free',
      'mid',
      'pricey',
    ]);
    expect(names(sortModels(models, { key: 'cost', direction: 'desc' }, defaultModel))).toEqual([
      'pricey',
      'mid',
      'free',
    ]);
  });

  it('sorts the cost column by the unrounded factor', () => {
    const defaultModel = model('default', null, 100);
    const models = [model('b', null, 104), model('a', null, 100), model('c', null, 96)];
    expect(names(sortModels(models, { key: 'cost', direction: 'asc' }, defaultModel))).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('does not mutate the input', () => {
    const models = [model('b'), model('a')];
    sortModels(models, { key: 'name', direction: 'asc' });
    expect(names(models)).toEqual(['b', 'a']);
  });
});

describe('toggleModelSort', () => {
  it('flips the direction of the active column', () => {
    expect(toggleModelSort({ key: 'name', direction: 'asc' }, 'name')).toEqual({
      key: 'name',
      direction: 'desc',
    });
    expect(toggleModelSort({ key: 'name', direction: 'desc' }, 'name')).toEqual({
      key: 'name',
      direction: 'asc',
    });
  });

  it('starts a new column ascending', () => {
    expect(toggleModelSort({ key: 'name', direction: 'desc' }, 'cost')).toEqual({
      key: 'cost',
      direction: 'asc',
    });
  });
});
