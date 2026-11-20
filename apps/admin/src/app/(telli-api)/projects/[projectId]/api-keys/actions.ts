'use server';

import { runServerAction } from '@shared/actions/run-server-action';

import { requireAdminAuth } from '@/auth/requireAdminAuth';
import {
  createApiKey,
  deleteApiKey,
  getApiKeys,
  getSingleApiKey,
  updateApiKey,
} from '@/services/api-key-service';
import { ApiKey, ApiKeyWithPlainKey, CreateApiKey, UpdateApiKey } from '@/types/api-key';

export async function getApiKeysAction(projectId: string): Promise<ApiKey[]> {
  await requireAdminAuth();

  return getApiKeys(projectId);
}

export async function getApiKeyByIdAction(projectId: string, apiKeyId: string): Promise<ApiKey> {
  await requireAdminAuth();

  return getSingleApiKey(projectId, apiKeyId);
}

export async function createApiKeyAction(
  projectId: string,
  data: CreateApiKey,
): Promise<ApiKeyWithPlainKey> {
  await requireAdminAuth();

  if (!data.name.trim()) {
    throw new Error('API-Schlüssel-Name ist erforderlich');
  }

  try {
    return await createApiKey(projectId, data);
  } catch {
    throw new Error('Fehler beim Erstellen des API-Schlüssels');
  }
}

export async function updateApiKeyAction(
  projectId: string,
  apiKeyId: string,
  data: UpdateApiKey,
): Promise<ApiKey> {
  await requireAdminAuth();

  if (!data.name.trim()) {
    throw new Error('API-Schlüssel-Name ist erforderlich');
  }

  try {
    return await updateApiKey(projectId, apiKeyId, data);
  } catch {
    throw new Error('Fehler beim Aktualisieren des API-Schlüssels');
  }
}

export async function deleteApiKeyAction(projectId: string, apiKeyId: string) {
  await requireAdminAuth();
  return runServerAction('deleteApiKeyAction', deleteApiKey)(projectId, apiKeyId);
}
