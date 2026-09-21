import {
  dbCreateProviderKey,
  dbDeleteProviderKey,
  dbGetOrganizationById,
  dbGetProviderKeysWithModelsByOrganizationId,
  dbUpdateProviderKey,
} from '@ais-chat/api-database';
import { llmModelSettingsSchema, isLlmProvider } from '@ais-chat/api-database/llm-model';
import { logInfo } from '@shared/logging';
import type { SaveProviderKey } from '@/types/provider-key';
import { syncBifrostProvidersForOrganizationOrThrow } from './bifrost-provider-sync-service';
import { runDeleteOrThrowError } from '@/utils/run-delete-or-throw-error';

export async function getProviderKeys(organizationId: string) {
  return dbGetProviderKeysWithModelsByOrganizationId(organizationId);
}

function parseSettings(provider: string, value: string) {
  const settings = llmModelSettingsSchema.parse(JSON.parse(value));
  if (settings.provider !== provider) {
    throw new Error('The settings provider must match the selected provider');
  }
  if (!isLlmProvider(settings, 'azure')) return settings;
  return { ...settings, baseUrl: new URL(settings.baseUrl).origin };
}

export async function createProviderKey(organizationId: string, data: SaveProviderKey) {
  const organization = await dbGetOrganizationById(organizationId);
  if (!organization) throw new Error('Organization not found');

  const providerKey = await dbCreateProviderKey({
    organizationId,
    name: data.name,
    provider: data.provider,
    settings: parseSettings(data.provider, data.settings),
    weight: data.weight,
    isEnabled: data.isEnabled,
  });
  if (!providerKey) throw new Error('Failed to create provider key');

  await syncBifrostProvidersForOrganizationOrThrow(organizationId);
  logInfo('Provider key was created successfully', {
    organizationId,
    providerKeyId: providerKey.id,
  });
  return providerKey;
}

export async function updateProviderKey(
  organizationId: string,
  providerKeyId: string,
  data: SaveProviderKey,
) {
  const providerKeys = await getProviderKeys(organizationId);
  if (!providerKeys.some(({ id }) => id === providerKeyId)) {
    throw new Error('Provider key not found');
  }

  const providerKey = await dbUpdateProviderKey(providerKeyId, organizationId, {
    name: data.name,
    provider: data.provider,
    settings: parseSettings(data.provider, data.settings),
    weight: data.weight,
    isEnabled: data.isEnabled,
  });
  if (!providerKey) throw new Error('Failed to update provider key');

  await syncBifrostProvidersForOrganizationOrThrow(organizationId);
  logInfo('Provider key was updated successfully', { organizationId, providerKeyId });
  return providerKey;
}

export async function deleteProviderKey(organizationId: string, providerKeyId: string) {
  const deleted = await runDeleteOrThrowError(
    () => dbDeleteProviderKey(providerKeyId, organizationId),
    'Provider-Key kann nicht gelöscht werden, da noch Daten damit verknüpft sind.',
  );
  if (!deleted) throw new Error('Provider key not found');

  await syncBifrostProvidersForOrganizationOrThrow(organizationId);
  logInfo('Provider key was deleted successfully', { organizationId, providerKeyId });
}
