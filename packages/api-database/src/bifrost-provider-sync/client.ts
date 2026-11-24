import { assertBifrostResponse, bifrostFetch } from './http';
import {
  BifrostKey,
  BifrostProvider,
  BifrostProviderConfig,
  BifrostProviderResponse,
  BifrostProviderSyncLogger,
} from './types';

// Encodes path segments so arbitrary provider/key ids can't escape `/api/providers/...`.
function providerPath(provider: string, ...segments: string[]): string {
  return ['/api/providers', encodeURIComponent(provider), ...segments.map(encodeURIComponent)].join(
    '/',
  );
}

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
  onKeyDelete,
  authoritative,
  logger,
}: {
  bifrostAdminUrl: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  providerConfig: BifrostProviderConfig;
  /** Called before each key deletion request, so callers learn about deletions even if the sync fails later. */
  onKeyDelete?: () => void;
  /**
   * Resets `network_config` when `providerConfig` omits it, instead of keeping Bifrost's current
   * value. Used to restore a baseline. `custom_provider_config` stays inherited: Bifrost rejects
   * a PUT that removes it.
   */
  authoritative?: boolean;
  logger?: BifrostProviderSyncLogger;
}): Promise<void> {
  await ensureBifrostProvider({
    bifrostAdminUrl,
    bifrostAdminUsername,
    bifrostAdminPassword,
    providerConfig,
    authoritative,
    logger,
  });
  const existingKeysBeforeSync = await listBifrostProviderKeys({
    bifrostAdminUrl,
    bifrostAdminUsername,
    bifrostAdminPassword,
    provider: providerConfig.provider,
    logger,
  });
  await allSettledOrThrow(
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
  await allSettledOrThrow(
    existingKeysBeforeSync
      .filter(({ name, id }) => id && !desiredKeyNames.has(name.toLowerCase()))
      .map((key) => {
        onKeyDelete?.();
        return deleteBifrostProviderKey({
          bifrostAdminUrl,
          bifrostAdminUsername,
          bifrostAdminPassword,
          provider: providerConfig.provider,
          keyId: key.id!,
          logger,
        });
      }),
  );
}

/**
 * Like `Promise.all`, but rejects only after every promise settled. A fail-fast `Promise.all`
 * would let sibling writes run on while the caller already starts a rollback.
 */
async function allSettledOrThrow(promises: Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(promises);
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
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
    path: providerPath(provider),
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
      path: providerPath(provider, 'keys', keyId),
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
  authoritative,
  logger,
}: {
  bifrostAdminUrl: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  providerConfig: BifrostProviderConfig;
  authoritative?: boolean;
  logger?: BifrostProviderSyncLogger;
}): Promise<void> {
  const providerResponse = await bifrostFetch({
    bifrostAdminUrl,
    bifrostAdminUsername,
    bifrostAdminPassword,
    path: providerPath(providerConfig.provider),
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
      path: providerPath(providerConfig.provider),
      init: {
        method: 'PUT',
        body: JSON.stringify(
          getUpdateProviderPayload(providerConfig, existingProvider, authoritative),
        ),
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
        path: providerPath(provider, 'keys', existingKey.id),
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
      path: providerPath(provider, 'keys'),
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
      path: providerPath(provider, 'keys'),
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
    ...(providerConfig.prompt_cache ? { prompt_cache: providerConfig.prompt_cache } : {}),
    ...(providerConfig.custom_provider_config
      ? { custom_provider_config: providerConfig.custom_provider_config }
      : {}),
  };
}

function getUpdateProviderPayload(
  providerConfig: BifrostProviderConfig,
  existingProvider: BifrostProviderResponse,
  authoritative = false,
) {
  const networkConfig = authoritative
    ? providerConfig.network_config
    : (providerConfig.network_config ?? existingProvider.network_config);
  return {
    ...(networkConfig ? { network_config: networkConfig } : {}),
    ...(existingProvider.concurrency_and_buffer_size
      ? { concurrency_and_buffer_size: existingProvider.concurrency_and_buffer_size }
      : {}),
    ...(existingProvider.proxy_config ? { proxy_config: existingProvider.proxy_config } : {}),
    ...(providerConfig.prompt_cache ? { prompt_cache: providerConfig.prompt_cache } : {}),
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
