import {
  dbGetAllApiKeys,
  dbGetAllModelMappingsForApiKey,
  dbGetApiKeyIdsForModel,
  dbSetApiKeysForModel,
  dbUpdateModelMappingsForApiKey,
} from '@ais-chat/api-database';
import { logInfo } from '@shared/logging';
import { dbUpdateLlmModelsForAllFederalStates } from '@shared/db/functions/llm-model';

export async function getModelApiKeyMappings(projectId: string, apiKeyId: string) {
  return dbGetAllModelMappingsForApiKey(projectId, apiKeyId);
}

export async function saveModelApiKeyMappings(
  projectId: string,
  apiKeyId: string,
  modelIds: string[],
) {
  const result = await dbUpdateModelMappingsForApiKey(projectId, apiKeyId, modelIds);

  await dbUpdateLlmModelsForAllFederalStates();

  logInfo('API Key mapping was updated successfully', { projectId, apiKeyId, modelIds });

  return result;
}

export async function getLlmApiKeyAssignmentsData(modelId: string) {
  const [apiKeys, assignedApiKeyIds] = await Promise.all([
    dbGetAllApiKeys(),
    dbGetApiKeyIdsForModel(modelId),
  ]);

  return { apiKeys, assignedApiKeyIds };
}

export async function saveApiKeysForModel(modelId: string, apiKeyIds: string[]) {
  await dbSetApiKeysForModel(modelId, apiKeyIds);

  await dbUpdateLlmModelsForAllFederalStates();

  logInfo('Model API key assignments were updated successfully', { modelId, apiKeyIds });
}
