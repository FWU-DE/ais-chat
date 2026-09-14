import {
  dbGetAllApiKeysByProjectId,
  dbGetApiKey,
  dbCreateJustTheApiKey,
  dbUpdateApiKey,
  dbDeleteApiKey,
} from '@ais-chat/api-database';
import { CreateApiKey, UpdateApiKey } from '../types/api-key';
import { logInfo } from '@shared/logging';
import { runDeleteOrThrowError } from '@/utils/run-delete-or-throw-error';

function stripSensitiveFields<T extends { keyId?: string; secretHash?: string }>(
  apiKey: T,
): Omit<T, 'keyId' | 'secretHash'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { keyId, secretHash, ...rest } = apiKey;
  return rest;
}

export async function getApiKeys(organizationId: string, projectId: string) {
  const apiKeys = await dbGetAllApiKeysByProjectId(organizationId, projectId);
  return apiKeys.map(stripSensitiveFields);
}

export async function getSingleApiKey(organizationId: string, projectId: string, apiKeyId: string) {
  const apiKey = await dbGetApiKey(organizationId, projectId, apiKeyId);
  if (!apiKey) throw new Error('API key not found');
  return stripSensitiveFields(apiKey);
}

export async function createApiKey(projectId: string, apiKeyData: CreateApiKey) {
  const result = await dbCreateJustTheApiKey({
    ...apiKeyData,
    projectId,
  });

  logInfo('API Key was created successfully', { projectId, apiKeyData });

  return result;
}

export async function updateApiKey(
  organizationId: string,
  projectId: string,
  apiKeyId: string,
  apiKeyData: UpdateApiKey,
) {
  const result = await dbUpdateApiKey(organizationId, projectId, apiKeyId, apiKeyData);

  logInfo('API Key was updated successfully', { projectId, apiKeyId, apiKeyData });

  return result;
}

export async function deleteApiKey(organizationId: string, projectId: string, apiKeyId: string) {
  const apiKey = await dbGetApiKey(organizationId, projectId, apiKeyId);
  if (!apiKey) throw new Error('API key not found');

  await runDeleteOrThrowError(
    () => dbDeleteApiKey(apiKeyId),
    'API-Schlüssel kann nicht gelöscht werden, da er noch verwendet wird.',
  );

  logInfo('API Key was deleted successfully', { organizationId, projectId, apiKeyId });
}
