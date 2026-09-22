import {
  BifrostKey,
  BifrostProvider,
  BifrostProviderConfig,
  BifrostProviderResponse,
  BifrostProviderSyncLogger,
} from './types';
import { assertBifrostResponse, bifrostFetch } from './http';

/**
 * Applies one provider config and all of its keys to Bifrost.
 *
 * Bifrost updates keys by ID, while our desired state is keyed by deterministic names.
 * Therefore we list keys once and use that list to decide whether to create or update each key.
 */
export async function syncBifrostProvider({
  bifrostAdminUrl,
  bifrostAdminUsername,
  bifrostAdminPassword,
  providerConfig,
  logger,
}: {
  bifrostAdminUrl: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  providerConfig: BifrostProviderConfig;
  logger?: BifrostProviderSyncLogger;
}): Promise<void> {
  await ensureBifrostProvider({
    bifrostAdminUrl,
    bifrostAdminUsername,
    bifrostAdminPassword,
    providerConfig,
    logger,
  });
  const existingKeysBeforeSync = await listBifrostProviderKeys({
    bifrostAdminUrl,
    bifrostAdminUsername,
    bifrostAdminPassword,
    provider: providerConfig.provider,
    logger,
  });
  await Promise.all(
    providerConfig.keys.map((key) =>
      syncBifrostProviderKey({
        bifrostAdminUrl,
        bifrostAdminUsername,
        bifrostAdminPassword,
        provider: providerConfig.provider,
        key,
        existingKeys: existingKeysBeforeSync,
        logger,
      }),
    ),
  );
  const desiredKeyNames = new Set(providerConfig.keys.map(({ name }) => name.toLowerCase()));
  await Promise.all(
    existingKeysBeforeSync
      .filter(({ name, id }) => id && !desiredKeyNames.has(name.toLowerCase()))
      .map((key) =>
        deleteBifrostProviderKey({
          bifrostAdminUrl,
          bifrostAdminUsername,
          bifrostAdminPassword,
          provider: providerConfig.provider,
          keyId: key.id!,
          logger,
        }),
      ),
  );
}

/**
 * Retrieves every provider currently configured in Bifrost.
 */
export async function listBifrostProviders({
  bifrostAdminUrl,
  bifrostAdminUsername,
  bifrostAdminPassword,
  logger,
}: {
  bifrostAdminUrl: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  logger?: BifrostProviderSyncLogger;
}): Promise<BifrostProviderResponse[]> {
  const response = await assertBifrostResponse(
    bifrostFetch({
      bifrostAdminUrl,
      bifrostAdminUsername,
      bifrostAdminPassword,
      path: '/api/providers',
      init: { method: 'GET' },
    }),
    logger,
  );
  const providers = (await response.json()) as { providers?: BifrostProviderResponse[] };
  return providers.providers ?? [];
}

/**
 * Removes a provider entirely from Bifrost. Tolerates the provider already being gone (404).
 */
export async function deleteBifrostProvider({
  bifrostAdminUrl,
  bifrostAdminUsername,
  bifrostAdminPassword,
  provider,
  logger,
}: {
  bifrostAdminUrl: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  provider: string;
  logger?: BifrostProviderSyncLogger;
}): Promise<void> {
  const response = await bifrostFetch({
    bifrostAdminUrl,
    bifrostAdminUsername,
    bifrostAdminPassword,
    path: `/api/providers/${provider}`,
    init: { method: 'DELETE' },
  });
  if (response.status === 404) return;
  await assertBifrostResponse(Promise.resolve(response), logger);
}

async function deleteBifrostProviderKey({
  bifrostAdminUrl,
  bifrostAdminUsername,
  bifrostAdminPassword,
  provider,
  keyId,
  logger,
}: {
  bifrostAdminUrl: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  provider: BifrostProvider;
  keyId: string;
  logger?: BifrostProviderSyncLogger;
}): Promise<void> {
  await assertBifrostResponse(
    bifrostFetch({
      bifrostAdminUrl,
      bifrostAdminUsername,
      bifrostAdminPassword,
      path: `/api/providers/${provider}/keys/${keyId}`,
      init: { method: 'DELETE' },
    }),
    logger,
  );
}

async function ensureBifrostProvider({
  bifrostAdminUrl,
  bifrostAdminUsername,
  bifrostAdminPassword,
  providerConfig,
  logger,
}: {
  bifrostAdminUrl: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  providerConfig: BifrostProviderConfig;
  logger?: BifrostProviderSyncLogger;
}): Promise<void> {
  const providerResponse = await bifrostFetch({
    bifrostAdminUrl,
    bifrostAdminUsername,
    bifrostAdminPassword,
    path: `/api/providers/${providerConfig.provider}`,
    init: {
      method: 'GET',
    },
  });

  if (providerResponse.status === 404) {
    await assertBifrostResponse(
      bifrostFetch({
        bifrostAdminUrl,
        bifrostAdminUsername,
        bifrostAdminPassword,
        path: '/api/providers',
        init: {
          method: 'POST',
          body: JSON.stringify(getAddProviderPayload(providerConfig)),
        },
      }),
      logger,
    );
    return;
  }

  const existingProviderResponse = await assertBifrostResponse(
    Promise.resolve(providerResponse),
    logger,
  );
  const existingProvider = (await existingProviderResponse.json()) as BifrostProviderResponse;

  await assertBifrostResponse(
    bifrostFetch({
      bifrostAdminUrl,
      bifrostAdminUsername,
      bifrostAdminPassword,
      path: `/api/providers/${providerConfig.provider}`,
      init: {
        method: 'PUT',
        body: JSON.stringify(getUpdateProviderPayload(providerConfig, existingProvider)),
      },
    }),
    logger,
  );
}

async function syncBifrostProviderKey({
  bifrostAdminUrl,
  bifrostAdminUsername,
  bifrostAdminPassword,
  provider,
  key,
  existingKeys,
  logger,
}: {
  bifrostAdminUrl: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  provider: BifrostProvider;
  key: BifrostKey;
  existingKeys: BifrostKey[];
  logger?: BifrostProviderSyncLogger;
}): Promise<void> {
  const existingKey = existingKeys.find(
    (existingKey) => existingKey.name.toLowerCase() === key.name.toLowerCase(),
  );

  if (existingKey?.id) {
    await assertBifrostResponse(
      bifrostFetch({
        bifrostAdminUrl,
        bifrostAdminUsername,
        bifrostAdminPassword,
        path: `/api/providers/${provider}/keys/${existingKey.id}`,
        init: {
          method: 'PUT',
          body: JSON.stringify({ ...existingKey, ...key, id: existingKey.id }),
        },
      }),
      logger,
    );
    return;
  }

  await assertBifrostResponse(
    bifrostFetch({
      bifrostAdminUrl,
      bifrostAdminUsername,
      bifrostAdminPassword,
      path: `/api/providers/${provider}/keys`,
      init: {
        method: 'POST',
        body: JSON.stringify(key),
      },
    }),
    logger,
  );
}

async function listBifrostProviderKeys({
  bifrostAdminUrl,
  bifrostAdminUsername,
  bifrostAdminPassword,
  provider,
  logger,
}: {
  bifrostAdminUrl: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  provider: BifrostProvider;
  logger?: BifrostProviderSyncLogger;
}): Promise<BifrostKey[]> {
  const keysResponse = await assertBifrostResponse(
    bifrostFetch({
      bifrostAdminUrl,
      bifrostAdminUsername,
      bifrostAdminPassword,
      path: `/api/providers/${provider}/keys`,
      init: { method: 'GET' },
    }),
    logger,
  );
  const keys = (await keysResponse.json()) as { keys?: BifrostKey[] };
  return keys.keys ?? [];
}

function getAddProviderPayload(providerConfig: BifrostProviderConfig) {
  return {
    provider: providerConfig.provider,
    ...(providerConfig.network_config ? { network_config: providerConfig.network_config } : {}),
    ...(providerConfig.custom_provider_config
      ? { custom_provider_config: providerConfig.custom_provider_config }
      : {}),
  };
}

function getUpdateProviderPayload(
  providerConfig: BifrostProviderConfig,
  existingProvider: BifrostProviderResponse,
) {
  return {
    ...(providerConfig.network_config || existingProvider.network_config
      ? { network_config: providerConfig.network_config ?? existingProvider.network_config }
      : {}),
    ...(existingProvider.concurrency_and_buffer_size
      ? { concurrency_and_buffer_size: existingProvider.concurrency_and_buffer_size }
      : {}),
    ...(existingProvider.proxy_config ? { proxy_config: existingProvider.proxy_config } : {}),
    ...(existingProvider.send_back_raw_request !== undefined
      ? { send_back_raw_request: existingProvider.send_back_raw_request }
      : {}),
    ...(existingProvider.send_back_raw_response !== undefined
      ? { send_back_raw_response: existingProvider.send_back_raw_response }
      : {}),
    ...(existingProvider.store_raw_request_response !== undefined
      ? { store_raw_request_response: existingProvider.store_raw_request_response }
      : {}),
    ...(providerConfig.custom_provider_config || existingProvider.custom_provider_config
      ? {
          custom_provider_config:
            providerConfig.custom_provider_config ?? existingProvider.custom_provider_config,
        }
      : {}),
  };
}
