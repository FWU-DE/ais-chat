import { dbGetLlmModelsByFederalStateId } from '@shared/db/functions/llm-model';
import { LlmModelSelectModel } from '@shared/db/schema';
import { logError } from '@shared/logging';

import { findStaticModelByRoleAndFederalStateId } from './llm-model-service';
import { getFirstTextModel } from './llm-model-utils';

/**
 * Get the auxiliary model for the federal state
 * @returns The auxiliary model for the federal state
 */
export async function getAuxiliaryModel(federalStateId: string): Promise<LlmModelSelectModel> {
  const [llmModels, configuredAuxiliaryModel, configuredFallbackModel] = await Promise.all([
    dbGetLlmModelsByFederalStateId({ federalStateId }),
    findStaticModelByRoleAndFederalStateId({ role: 'auxiliary', federalStateId }),
    findStaticModelByRoleAndFederalStateId({ role: 'auxiliary-fallback', federalStateId }),
  ]);
  const auxiliaryModel =
    configuredAuxiliaryModel ?? configuredFallbackModel ?? getFirstTextModel(llmModels);
  if (auxiliaryModel === undefined) {
    const error = new Error('No auxiliary model found for federal state id ' + federalStateId);
    logError(error.message, error);

    throw error;
  }

  return auxiliaryModel;
}

/**
 * Get a strong auxiliary model for the federal state for more complex tasks like language determination.
 * This model is more capable than the default auxiliary model but also more resource-intensive, so should be used wisely.
 * @returns The strong auxiliary model for the federal state
 */
export async function getStrongAuxiliaryModel(
  federalStateId: string,
): Promise<LlmModelSelectModel> {
  const [llmModels, auxiliaryModel, configuredAuxiliaryModel, configuredFallbackModel] =
    await Promise.all([
      dbGetLlmModelsByFederalStateId({ federalStateId }),
      findStaticModelByRoleAndFederalStateId({ role: 'strong-auxiliary', federalStateId }),
      findStaticModelByRoleAndFederalStateId({ role: 'auxiliary', federalStateId }),
      findStaticModelByRoleAndFederalStateId({ role: 'auxiliary-fallback', federalStateId }),
    ]);
  if (auxiliaryModel !== undefined) {
    return auxiliaryModel;
  }

  const fallbackAuxiliaryModel =
    configuredAuxiliaryModel ?? configuredFallbackModel ?? getFirstTextModel(llmModels);
  if (fallbackAuxiliaryModel === undefined) {
    const error = new Error('No auxiliary model found for federal state id ' + federalStateId);
    logError(error.message, error);

    throw error;
  }

  return fallbackAuxiliaryModel;
}

/**
 * Get the model that prepares text for speech output (SSML rewrite).
 * Falls back to the strong auxiliary model if no speech auxiliary model is configured or available.
 * @returns The speech auxiliary model for the federal state
 */
export async function getSpeechAuxiliaryModel(
  federalStateId: string,
): Promise<LlmModelSelectModel> {
  const speechAuxiliaryModel = await findStaticModelByRoleAndFederalStateId({
    role: 'speech-auxiliary',
    federalStateId,
  });
  return speechAuxiliaryModel ?? getStrongAuxiliaryModel(federalStateId);
}
