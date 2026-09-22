import type { LlmProviderKeyWithModels } from '../../functions';
import { CUSTOM_OPENAI_PROVIDER_SUFFIX } from '../../llm-model';
import type { BifrostProviderConfig } from '../types';
import { buildKey, stripTrailingV1 } from './utils';

type AllowedRequests = NonNullable<
  BifrostProviderConfig['custom_provider_config']
>['allowed_requests'];

// Bifrost rejects a custom provider whose id matches one of its ~30 built-in provider names with
// "Custom provider cannot be same as a standard provider". Suffixing guarantees no collision with
// any current or future built-in name, matching the convention Bifrost's own docs use
// (`openai-custom`, `openai-production`, ...).

/**
 * Derives a stable Bifrost provider id for an `openai`-typed provider key that uses a non-default
 * base URL, so it gets its own Bifrost provider config instead of merging with the real OpenAI
 * provider (or with other custom base URLs). Based on the provider key's `name`, which is unique
 * per organization.
 */
export function buildCustomOpenAiProviderId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug}${CUSTOM_OPENAI_PROVIDER_SUFFIX}`;
}

export function isCustomOpenAiProviderId(id: string): boolean {
  return id.endsWith(CUSTOM_OPENAI_PROVIDER_SUFFIX);
}

/**
 * Builds a Bifrost provider config for an OpenAI-API-compatible upstream (e.g. Ionos, or an
 * `openai`-typed key with a custom base URL) using Bifrost's custom provider mechanism.
 */
export function buildOpenAiCompatibleProviderConfig(
  providerId: string,
  providerKey: LlmProviderKeyWithModels,
  apiKey: string,
  baseUrl: string,
  allowedRequests?: AllowedRequests,
): BifrostProviderConfig {
  return {
    provider: providerId,
    network_config: {
      base_url: stripTrailingV1(baseUrl),
      ...(isMockLlmBaseUrl(baseUrl) ? { allow_private_network: true } : {}),
    },
    custom_provider_config: {
      base_provider_type: 'openai',
      ...(allowedRequests ? { allowed_requests: allowedRequests } : {}),
    },
    keys: [buildKey(providerId, providerKey, apiKey)],
  };
}

function isMockLlmBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).port === '6556';
  } catch {
    return false;
  }
}
