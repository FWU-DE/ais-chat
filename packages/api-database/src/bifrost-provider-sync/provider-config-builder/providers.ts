import type { LlmProviderKeyWithModels } from '../../functions';
import { DEFAULT_OPENAI_BASE_URL, isBifrostNativeSettings, isLlmProvider } from '../../llm-model';
import type { BifrostKey, BifrostKeyAlias, BifrostProviderConfig } from '../types';
import {
  buildCustomOpenAiProviderId,
  buildOpenAiCompatibleProviderConfig,
} from './openai-compatible';
import { buildKey, getBifrostModelName, getOrigin } from './utils';

/**
 * Azure AI Speech speaks SSML at `{endpoint}/tts/cognitiveservices/v1`, not the Azure OpenAI
 * deployment path. Azure OpenAI TTS deployments are speech models too, so the route is only
 * switched for models that explicitly opt in via `modelConfig.useAzureSpeechEndpoint`.
 */
function withSpeechEndpointAliases(
  key: BifrostKey,
  providerKey: LlmProviderKeyWithModels,
): BifrostKey {
  const azureSpeechModelNames = new Set(
    providerKey.models
      .filter(({ model }) => model.modelConfig?.useAzureSpeechEndpoint === true)
      .map(({ model }) => getBifrostModelName(model.name)),
  );
  if (azureSpeechModelNames.size === 0 || !key.aliases) return key;

  const aliases: Record<string, BifrostKeyAlias> = {};
  for (const [name, alias] of Object.entries(key.aliases)) {
    aliases[name] =
      azureSpeechModelNames.has(name) && typeof alias === 'string'
        ? { model_id: alias, use_speech_endpoints: true }
        : alias;
  }
  return { ...key, aliases };
}

export function buildAzureProviderConfig(
  providerKey: LlmProviderKeyWithModels,
): BifrostProviderConfig | undefined {
  if (!isLlmProvider(providerKey.settings, 'azure')) return undefined;
  const settings = providerKey.settings;
  const endpoint = getOrigin(settings.baseUrl);
  if (!endpoint) return undefined;
  return {
    provider: 'azure',
    keys: [
      withSpeechEndpointAliases(
        buildKey('azure', providerKey, settings.apiKey, {
          azure_key_config: { endpoint },
        }),
        providerKey,
      ),
    ],
  };
}

export function buildOpenAiProviderConfig(
  providerKey: LlmProviderKeyWithModels,
): BifrostProviderConfig | undefined {
  if (!isLlmProvider(providerKey.settings, 'openai')) return undefined;
  const settings = providerKey.settings;
  if (settings.baseUrl === DEFAULT_OPENAI_BASE_URL) {
    return {
      provider: 'openai',
      keys: [buildKey('openai', providerKey, settings.apiKey)],
    };
  }
  return buildOpenAiCompatibleProviderConfig(
    buildCustomOpenAiProviderId(providerKey.name),
    providerKey,
    settings.apiKey,
    settings.baseUrl,
  );
}

export function buildIonosProviderConfig(
  providerKey: LlmProviderKeyWithModels,
): BifrostProviderConfig | undefined {
  if (!isLlmProvider(providerKey.settings, 'ionos')) return undefined;
  const settings = providerKey.settings;
  return buildOpenAiCompatibleProviderConfig(
    'ionos',
    providerKey,
    settings.apiKey,
    settings.baseUrl,
    // Ionos doesn't support the Responses API.
    {
      list_models: true,
      chat_completion: true,
      chat_completion_stream: true,
      responses: false,
      responses_stream: false,
      embedding: true,
      image_generation: true,
    },
  );
}

export function buildVertexProviderConfig(
  providerKey: LlmProviderKeyWithModels,
): BifrostProviderConfig | undefined {
  if (!isLlmProvider(providerKey.settings, 'google')) return undefined;
  const settings = providerKey.settings;
  if (settings.authCredentials === undefined) return undefined;
  const authCredentials =
    typeof settings.authCredentials === 'string'
      ? settings.authCredentials
      : JSON.stringify(settings.authCredentials);
  return {
    provider: 'vertex',
    keys: [
      buildKey('vertex', providerKey, '', {
        vertex_key_config: {
          project_id: settings.projectId,
          region: settings.location,
          auth_credentials: authCredentials,
        },
      }),
    ],
  };
}

// Registers an arbitrary Bifrost-native provider using its exact id, with no custom-provider
// wrapper. Used for provider keys whose `settings.provider` isn't one of our reserved values.
export function buildBifrostNativeProviderConfig(
  providerKey: LlmProviderKeyWithModels,
): BifrostProviderConfig | undefined {
  if (!isBifrostNativeSettings(providerKey.settings)) return undefined;
  const settings = providerKey.settings;
  return {
    provider: settings.provider,
    // Always present (even with `base_url: undefined`, dropped by `JSON.stringify`), so an update
    // explicitly clears a previously-configured base URL instead of the sync falling back to
    // Bifrost's existing network_config for this provider (see `getUpdateProviderPayload`).
    network_config: { base_url: settings.baseUrl },
    keys: [buildKey(settings.provider, providerKey, settings.apiKey)],
  };
}
