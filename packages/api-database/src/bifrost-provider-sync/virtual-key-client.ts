import { assertBifrostResponse, bifrostFetch } from './http';
import {
  BifrostProviderSyncLogger,
  BifrostVirtualKey,
  BifrostVirtualKeyProviderConfig,
} from './types';

const LIST_VIRTUAL_KEYS_PAGE_SIZE = 100;

/**
 * Retrieves every virtual key configured in Bifrost.
 *
 * No virtual key ID is assumed - all virtual keys returned by Bifrost are treated as sync
 * targets, so provider access stays correct regardless of which/how many virtual keys exist.
 */
export async function listBifrostVirtualKeys({
  bifrostAdminUrl,
  bifrostAdminUsername,
  bifrostAdminPassword,
  logger,
}: {
  bifrostAdminUrl: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  logger?: BifrostProviderSyncLogger;
}): Promise<BifrostVirtualKey[]> {
  const virtualKeys: BifrostVirtualKey[] = [];
  let offset = 0;

  for (;;) {
    const response = await assertBifrostResponse(
      bifrostFetch({
        bifrostAdminUrl,
        bifrostAdminUsername,
        bifrostAdminPassword,
        path: `/api/governance/virtual-keys?limit=${LIST_VIRTUAL_KEYS_PAGE_SIZE}&offset=${offset}`,
        init: { method: 'GET' },
      }),
      logger,
    );
    const page = (await response.json()) as {
      virtual_keys?: BifrostVirtualKey[];
      total_count?: number;
    };
    const pageVirtualKeys = page.virtual_keys ?? [];
    virtualKeys.push(...pageVirtualKeys);
    offset += pageVirtualKeys.length;

    if (pageVirtualKeys.length === 0 || offset >= (page.total_count ?? offset)) {
      break;
    }
  }

  return virtualKeys;
}

export async function updateBifrostVirtualKeyProviders({
  bifrostAdminUrl,
  bifrostAdminUsername,
  bifrostAdminPassword,
  virtualKeyId,
  providerConfigs,
  logger,
}: {
  bifrostAdminUrl: string;
  bifrostAdminUsername?: string;
  bifrostAdminPassword?: string;
  virtualKeyId: string;
  providerConfigs: BifrostVirtualKeyProviderConfig[];
  logger?: BifrostProviderSyncLogger;
}): Promise<void> {
  await assertBifrostResponse(
    bifrostFetch({
      bifrostAdminUrl,
      bifrostAdminUsername,
      bifrostAdminPassword,
      path: `/api/governance/virtual-keys/${virtualKeyId}`,
      init: {
        method: 'PUT',
        body: JSON.stringify({ provider_configs: providerConfigs }),
      },
    }),
    logger,
  );
}
