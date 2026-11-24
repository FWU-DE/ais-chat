import { REASONING_EFFORTS } from '@ais-chat/api-database/types';
import type { LlmModelSelectModel } from '@shared/db/schema';

import { getCostFactor } from './cost-factor';

export type ModelSortKey = 'name' | 'reasoning' | 'cost';
export type SortDirection = 'asc' | 'desc';
export type ModelSort = { key: ModelSortKey; direction: SortDirection };

export const INITIAL_MODEL_SORT: ModelSort = { key: 'name', direction: 'asc' };

function getReasoningRank(model: LlmModelSelectModel): number {
  const effort = model.reasoning?.effort;
  return effort ? REASONING_EFFORTS.indexOf(effort) : -1;
}

const comparators: Record<
  ModelSortKey,
  (a: LlmModelSelectModel, b: LlmModelSelectModel, defaultModel?: LlmModelSelectModel) => number
> = {
  name: (a, b) => a.displayName.localeCompare(b.displayName, 'de', { sensitivity: 'base' }),
  reasoning: (a, b) => getReasoningRank(a) - getReasoningRank(b),
  cost: (a, b, defaultModel) =>
    getCostFactor({ model: a, defaultModel }) - getCostFactor({ model: b, defaultModel }),
};

/**
 * Returns a sorted copy; models that compare equal keep their original order in both directions.
 * The cost column sorts by the unrounded factor relative to the default model.
 */
export function sortModels(
  models: LlmModelSelectModel[],
  { key, direction }: ModelSort,
  defaultModel?: LlmModelSelectModel,
) {
  const sign = direction === 'asc' ? 1 : -1;
  return [...models].sort((a, b) => sign * comparators[key](a, b, defaultModel));
}

/** Clicking the active column flips the direction; a new column starts ascending. */
export function toggleModelSort(current: ModelSort, key: ModelSortKey): ModelSort {
  return current.key === key
    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: 'asc' };
}
