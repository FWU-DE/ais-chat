'use server';

import { requireAdminAuth } from '@/auth/requireAdminAuth';
import { getLargeLanguageModels } from '@/services/llm-service';
import {
  getModelApiKeyMappings,
  saveModelApiKeyMappings,
} from '@/services/model-api-key-mapping-service';

export async function getModelMappingsAction(projectId: string, apiKeyId: string) {
  await requireAdminAuth();

  return getModelApiKeyMappings(projectId, apiKeyId);
}

export async function getLargeLanguageModelsAction() {
  await requireAdminAuth();

  return getLargeLanguageModels();
}

export async function saveModelMappingsAction(
  projectId: string,
  apiKeyId: string,
  modelIds: string[],
) {
  await requireAdminAuth();

  return saveModelApiKeyMappings(projectId, apiKeyId, modelIds);
}
