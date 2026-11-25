import type { ToolCall, ToolOutcome } from '@ais-chat/ai-core/chat/types';
import type { LlmModelPriceMetadata, ReasoningEffort } from '@ais-chat/api-database/types';
import { dbGetLlmModelsByFederalStateId } from '@shared/db/functions/llm-model';
import type { LlmModelSelectModel } from '@shared/db/schema';
import { getCostFactor, roundCostFactor } from '@shared/llm-models/cost-factor';
import { getDefaultModel } from '@shared/llm-models/llm-model-service';
import { logError } from '@shared/logging';

import { TOOL_NAMES } from '@/types/tool-names';

import { parseGenericPersistedToolResult } from './parse-persisted-tool-result';
import type { ToolActivity, ToolDefinition, ToolRegistration } from './types';

export type AgentModelSummary = {
  id: string;
  displayName: string;
  description: string;
  vendor: string | null;
  type: 'text' | 'image';
  reasoningEffort: ReasoningEffort | null;
  /** Completion token price relative to the default model (0 = free); null for non-text models. */
  costFactor: number | null;
  /**
   * Passed through as stored. Text model: image input formats it can read (empty = no image
   * input). Image model: formats accepted as input for image editing (empty = text-to-image only).
   */
  supportedImageFormats: string[];
  isNew: boolean;
  isDefault: boolean;
};

type ListModelsToolResponse = { models: AgentModelSummary[] };

type TextOrImageModel = LlmModelSelectModel & {
  priceMetadata: Extract<LlmModelPriceMetadata, { type: 'text' | 'image' }>;
};

function isTextOrImageModel(model: LlmModelSelectModel): model is TextOrImageModel {
  return model.priceMetadata.type === 'text' || model.priceMetadata.type === 'image';
}

export function toAgentModelSummaries({
  models,
  defaultModel,
}: {
  models: LlmModelSelectModel[];
  defaultModel: LlmModelSelectModel | undefined;
}): AgentModelSummary[] {
  return models.filter(isTextOrImageModel).map((model) => ({
    id: model.id,
    displayName: model.displayName,
    description: model.description,
    vendor: model.vendor,
    type: model.priceMetadata.type,
    reasoningEffort: model.reasoning?.effort ?? null,
    costFactor:
      model.priceMetadata.type === 'text'
        ? roundCostFactor(getCostFactor({ model, defaultModel }))
        : null,
    supportedImageFormats: model.supportedImageFormats ?? [],
    isNew: model.isNew,
    isDefault: model.id === defaultModel?.id,
  }));
}

export const listModelsActivity: ToolActivity<ListModelsToolResponse> = {
  createStep: (toolCall: ToolCall) => ({
    kind: 'tool',
    id: toolCall.id,
    tool: TOOL_NAMES.listModels,
  }),
  parsePersistedResult: (raw) => parseGenericPersistedToolResult<ListModelsToolResponse>(raw),
};

export function buildListModelsTool({
  federalStateId,
}: {
  federalStateId: string;
}): ToolRegistration<ListModelsToolResponse> {
  const definition: ToolDefinition = {
    name: TOOL_NAMES.listModels,
    description:
      'Lists the AI models available to the user. Call this tool whenever the user asks which models exist, which model fits a use case, or how models differ. Base comparisons on each model\'s "description". "type" is "text" or "image". "costFactor" is the completion token price relative to the default model (1 = same as the default, 0 = free, null = not comparable, then do not state a cost). "supportedImageFormats" depends on "type": for a text model an empty list means it cannot read uploaded images; for an image model a non-empty list means it can edit an uploaded image, an empty list means text-to-image only. Mention image support when it is relevant to the user\'s use case.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  };

  const handler = async (): ToolOutcome<ListModelsToolResponse> => {
    try {
      const models = await dbGetLlmModelsByFederalStateId({ federalStateId });
      const defaultModel = await getDefaultModel({ federalStateId, models });
      return { models: toAgentModelSummaries({ models, defaultModel }) };
    } catch (error) {
      logError('Error loading models for list_models tool', error);
      return { error: 'Models could not be loaded.' };
    }
  };

  return {
    definition,
    handler,
    activity: listModelsActivity,
  };
}
