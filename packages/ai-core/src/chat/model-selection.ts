import type { ModelSelection } from './types';

export function normalizeModelSelection(selection: string | ModelSelection): ModelSelection {
  return typeof selection === 'string'
    ? { modelIds: [selection], modelName: selection }
    : selection;
}

export function getUsedModelId(selection: ModelSelection, modelId?: string) {
  return modelId && selection.modelIds.includes(modelId) ? modelId : selection.modelIds[0];
}
