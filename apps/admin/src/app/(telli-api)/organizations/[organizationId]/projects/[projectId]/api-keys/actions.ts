'use server';

import { requireAdminAuth } from '@/auth/requireAdminAuth';
import {
  getApiKeys,
  createApiKey,
  updateApiKey,
  getSingleApiKey,
  deleteApiKey,
} from '@/services/api-key-service';
import { ApiKey, ApiKeyWithPlainKey, CreateApiKey, UpdateApiKey } from '@/types/api-key';
import { runServerAction } from '@shared/actions/run-server-action';

export async function getApiKeysAction(
  organizationId: string,
  projectId: string,
): Promise<ApiKey[]> {
  await requireAdminAuth();

  return getApiKeys(organizationId, projectId);
}

export async function getApiKeyByIdAction(
  organizationId: string,
  projectId: string,
  apiKeyId: string,
): Promise<ApiKey> {
  await requireAdminAuth();

  return getSingleApiKey(organizationId, projectId, apiKeyId);
}

export async function createApiKeyAction(
  organizationId: string,
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
  organizationId: string,
  projectId: string,
  apiKeyId: string,
  data: UpdateApiKey,
): Promise<ApiKey> {
  await requireAdminAuth();

  if (!data.name.trim()) {
    throw new Error('API-Schlüssel-Name ist erforderlich');
  }

  try {
    return await updateApiKey(organizationId, projectId, apiKeyId, data);
  } catch {
    throw new Error('Fehler beim Aktualisieren des API-Schlüssels');
  }
}

export async function deleteApiKeyAction(
  organizationId: string,
  projectId: string,
  apiKeyId: string,
) {
  await requireAdminAuth();
  return runServerAction('deleteApiKeyAction', deleteApiKey)(organizationId, projectId, apiKeyId);
}
