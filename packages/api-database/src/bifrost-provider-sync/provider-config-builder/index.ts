import type { LlmProviderKeyWithModels } from '../../functions';
import type { BifrostProvider, BifrostProviderConfig, BifrostProviderSyncLogger } from '../types';
import {
  buildAzureProviderConfig,
  buildBifrostNativeProviderConfig,
  buildIonosProviderConfig,
  buildOpenAiProviderConfig,
  buildVertexProviderConfig,
} from './providers';

export function buildBifrostProviderConfigs(
  providerKeys: LlmProviderKeyWithModels[],
  logger?: BifrostProviderSyncLogger,
): BifrostProviderConfig[] {
  const configs = providerKeys.flatMap((providerKey) => {
    if (!providerKey.isEnabled || providerKey.models.every(({ model }) => model.isDeleted))
      return [];
    const config = buildProviderConfig(getBifrostProvider(providerKey.provider), providerKey);
    return config ? [config] : [];
  });

  const merged = new Map<BifrostProvider, BifrostProviderConfig>();
  for (const config of configs) {
    const existing = merged.get(config.provider);
    if (!existing) {
      merged.set(config.provider, config);
      continue;
    }
    if (JSON.stringify(existing.network_config) !== JSON.stringify(config.network_config)) {
      logger?.warning?.('Multiple network configs found while syncing Bifrost provider', {
        provider: config.provider,
      });
    }
    merged.set(config.provider, { ...existing, keys: [...existing.keys, ...config.keys] });
  }
  return [...merged.values()];
}

function buildProviderConfig(
  provider: BifrostProvider,
  providerKey: LlmProviderKeyWithModels,
): BifrostProviderConfig | undefined {
  if (provider === 'azure') return buildAzureProviderConfig(providerKey);
  if (provider === 'openai') return buildOpenAiProviderConfig(providerKey);
  if (provider === 'ionos') return buildIonosProviderConfig(providerKey);
  if (provider === 'vertex') return buildVertexProviderConfig(providerKey);
  return buildBifrostNativeProviderConfig(providerKey);
}

// Falls through to the arbitrary provider name for any value not in our reserved set.
function getBifrostProvider(provider: string): BifrostProvider {
  if (provider === 'azure' || provider === 'openai' || provider === 'ionos') return provider;
  if (provider === 'google' || provider === 'vertex') return 'vertex';
  return provider;
}
