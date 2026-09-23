import {
  dbGetAllApiKeysByOrganizationId,
  dbGetAllModelMappingsForApiKey,
  dbGetApiKeyIdsForModel,
  dbSetApiKeysForModel,
  dbUpdateModelMappingsForApiKey,
} from '@ais-chat/api-database';
import { logInfo } from '@shared/logging';
import { dbUpdateLlmModelsForAllFederalStates } from '@shared/db/functions/llm-model';
import { syncBifrostProvidersForOrganization } from './bifrost-provider-sync-service';

export async function getModelApiKeyMappings(
  organizationId: string,
  projectId: string,
  apiKeyId: string,
) {
  return dbGetAllModelMappingsForApiKey(organizationId, projectId, apiKeyId);
}

export async function saveModelApiKeyMappings(
  organizationId: string,
  projectId: string,
  apiKeyId: string,
  modelIds: string[],
) {
  const result = await dbUpdateModelMappingsForApiKey(
    organizationId,
    projectId,
    apiKeyId,
    modelIds,
  );

  await syncBifrostProvidersForOrganization(organizationId);
  await dbUpdateLlmModelsForAllFederalStates();

  logInfo('API Key mapping was updated successfully', { projectId, apiKeyId, modelIds });

  return result;
}

export async function getLlmApiKeyAssignmentsData(organizationId: string, modelId: string) {
  const [apiKeys, assignedApiKeyIds] = await Promise.all([
    dbGetAllApiKeysByOrganizationId(organizationId),
    dbGetApiKeyIdsForModel(organizationId, modelId),
  ]);

  return { apiKeys, assignedApiKeyIds };
}

export async function saveApiKeysForModel(
  organizationId: string,
  modelId: string,
  apiKeyIds: string[],
) {
  await dbSetApiKeysForModel(organizationId, modelId, apiKeyIds);

  await syncBifrostProvidersForOrganization(organizationId);
  await dbUpdateLlmModelsForAllFederalStates();

  logInfo('Model API key assignments were updated successfully', {
    organizationId,
    modelId,
    apiKeyIds,
  });
}
