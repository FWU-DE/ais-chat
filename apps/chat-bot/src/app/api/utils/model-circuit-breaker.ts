import type { ModelSelection } from '@ais-chat/ai-core';
import type { LlmModelSelectModel } from '@shared/db/schema';
import { findStaticModelByRoleAndFederalStateId } from '@shared/llm-models/llm-model-service';
import { logError } from '@shared/logging';
import { valkey } from '@shared/valkey';

const MODEL_UNAVAILABLE_TTL_SECONDS = 45;
const MODEL_UNAVAILABLE_PREFIX = 'model-unavailable:v1:';

async function isUnavailable(modelId: string) {
  try {
    return await valkey.hasItem(MODEL_UNAVAILABLE_PREFIX + modelId);
  } catch (error) {
    logError('Failed to check model circuit breaker, allowing model', error, { modelId });
    return false;
  }
}

async function markUnavailable(modelId: string) {
  try {
    await valkey.setItem(MODEL_UNAVAILABLE_PREFIX + modelId, true, {
      ttl: MODEL_UNAVAILABLE_TTL_SECONDS,
    });
  } catch (error) {
    logError('Failed to update model circuit breaker', error, { modelId });
  }
}

export async function getChatModelSelection({
  model,
  federalStateId,
}: {
  model: LlmModelSelectModel;
  federalStateId: string;
}): Promise<ModelSelection> {
  if (model.provider !== 'bifrost') {
    return {
      modelIds: [model.id],
      modelName: model.name,
    };
  }

  const fallback = await findStaticModelByRoleAndFederalStateId({
    role: 'fallback',
    federalStateId,
  });
  if (!fallback || fallback.id === model.id) {
    return {
      modelIds: [model.id],
      modelName: model.name,
    };
  }

  const unavailable = await Promise.all(
    [model, fallback].map((candidate) => isUnavailable(candidate.id)),
  );
  const availableCandidates = [model, fallback].filter((_, index) => !unavailable[index]);
  const candidates = availableCandidates.length > 0 ? availableCandidates : [fallback];

  const modelIds = candidates.map((candidate) => candidate.id) as [string, ...string[]];
  return {
    modelIds,
    modelName: candidates[0]!.name,
    onModelUsed: async (usedModelId) => {
      const usedIndex = modelIds.indexOf(usedModelId);
      if (usedIndex > 0) {
        await Promise.all(modelIds.slice(0, usedIndex).map(markUnavailable));
      }
    },
  };
}
