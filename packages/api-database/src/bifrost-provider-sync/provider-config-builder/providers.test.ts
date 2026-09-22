import { describe, test, expect } from 'vitest';
import {
  buildBifrostNativeProviderConfig,
  buildOpenAiProviderConfig,
  buildIonosProviderConfig,
} from './providers';
import { buildBifrostProviderConfigs } from './index';
import type { LlmProviderKeyWithModels } from '../../functions';

function providerKey(
  overrides: Partial<LlmProviderKeyWithModels> & {
    settings: LlmProviderKeyWithModels['settings'];
  },
): LlmProviderKeyWithModels {
  return {
    id: overrides.id ?? 'id-1',
    name: overrides.name ?? 'key',
    provider: overrides.settings.provider,
    weight: overrides.weight ?? 1,
    isEnabled: overrides.isEnabled ?? true,
    organizationId: overrides.organizationId ?? 'org-1',
    createdAt: overrides.createdAt ?? new Date(),
    models: overrides.models ?? [
      { model: { id: 'model-1', name: 'gpt-4o', isDeleted: false }, upstreamModelName: 'gpt-4o' },
    ],
    settings: overrides.settings,
  } as LlmProviderKeyWithModels;
}

describe('buildOpenAiProviderConfig', () => {
  test('uses the native "openai" provider for the default base URL', () => {
    const config = buildOpenAiProviderConfig(
      providerKey({
        settings: { provider: 'openai', apiKey: 'sk-1', baseUrl: 'https://api.openai.com/v1' },
      }),
    );

    expect(config?.provider).toBe('openai');
    expect(config?.custom_provider_config).toBeUndefined();
  });

  test('derives a custom provider id from the key name (suffixed to avoid colliding with a Bifrost built-in provider) for a non-default base URL', () => {
    const config = buildOpenAiProviderConfig(
      providerKey({
        name: 'ionos',
        settings: { provider: 'openai', apiKey: 'sk-1', baseUrl: 'https://ionos.example/v1' },
      }),
    );

    expect(config?.provider).toBe('ionos-custom');
    expect(config?.custom_provider_config).toEqual({
      base_provider_type: 'openai',
    });
    expect(config?.network_config?.base_url).toBe('https://ionos.example');
  });

  test('preserves a multi-segment path in the base URL, stripping only a trailing /v1', () => {
    const config = buildOpenAiProviderConfig(
      providerKey({
        name: 'acme',
        settings: {
          provider: 'openai',
          apiKey: 'sk-1',
          baseUrl: 'https://acme.example/api/v1',
        },
      }),
    );

    expect(config?.network_config?.base_url).toBe('https://acme.example/api');
  });

  test('leaves a base URL without a trailing /v1 untouched', () => {
    const config = buildOpenAiProviderConfig(
      providerKey({
        name: 'acme',
        settings: {
          provider: 'openai',
          apiKey: 'sk-1',
          baseUrl: 'https://acme.example/api',
        },
      }),
    );

    expect(config?.network_config?.base_url).toBe('https://acme.example/api');
  });
});

describe('buildIonosProviderConfig', () => {
  test('keeps the literal "ionos" provider id', () => {
    const config = buildIonosProviderConfig(
      providerKey({
        name: 'ionos',
        settings: { provider: 'ionos', apiKey: 'sk-1', baseUrl: 'https://ionos.example/v1' },
      }),
    );

    expect(config?.provider).toBe('ionos');
    expect(config?.custom_provider_config?.base_provider_type).toBe('openai');
  });

  test('does not enable the Responses API, unlike the generic openai-compatible config', () => {
    const config = buildIonosProviderConfig(
      providerKey({
        name: 'ionos',
        settings: { provider: 'ionos', apiKey: 'sk-1', baseUrl: 'https://ionos.example/v1' },
      }),
    );

    expect(config?.custom_provider_config?.allowed_requests?.responses).toBe(false);
    expect(config?.custom_provider_config?.allowed_requests?.responses_stream).toBe(false);
  });

  test('strips the path from the base URL, keeping only the origin', () => {
    const config = buildIonosProviderConfig(
      providerKey({
        name: 'ionos',
        settings: { provider: 'ionos', apiKey: 'sk-1', baseUrl: 'https://ionos.example/v1' },
      }),
    );

    expect(config?.network_config?.base_url).toBe('https://ionos.example');
  });
});

describe('buildBifrostNativeProviderConfig', () => {
  test('registers the arbitrary provider id verbatim, with no custom_provider_config', () => {
    const config = buildBifrostNativeProviderConfig(
      providerKey({
        name: 'acme',
        settings: { provider: 'acme', apiKey: 'sk-1', baseUrl: 'https://acme.example/api' },
      }),
    );

    expect(config?.provider).toBe('acme');
    expect(config?.custom_provider_config).toBeUndefined();
    expect(config?.network_config?.base_url).toBe('https://acme.example/api');
  });

  test('sends an explicit empty network_config when no base URL is set, to clear a previously-configured one', () => {
    const config = buildBifrostNativeProviderConfig(
      providerKey({
        name: 'groq',
        settings: { provider: 'groq', apiKey: 'sk-1' },
      }),
    );

    expect(config?.network_config).toEqual({ base_url: undefined });
  });

  test('returns undefined for reserved provider names', () => {
    const config = buildBifrostNativeProviderConfig(
      providerKey({
        settings: { provider: 'openai', apiKey: 'sk-1', baseUrl: 'https://api.openai.com/v1' },
      }),
    );

    expect(config).toBeUndefined();
  });
});

describe('buildBifrostProviderConfigs', () => {
  test('merges two keys sharing the same arbitrary provider name', () => {
    const configs = buildBifrostProviderConfigs([
      providerKey({
        name: 'acme-1',
        settings: { provider: 'acme', apiKey: 'sk-1', baseUrl: 'https://acme.example/api' },
      }),
      providerKey({
        id: 'id-2',
        name: 'acme-2',
        settings: { provider: 'acme', apiKey: 'sk-2', baseUrl: 'https://acme.example/api' },
      }),
    ]);

    expect(configs).toHaveLength(1);
    expect(configs[0]?.provider).toBe('acme');
    expect(configs[0]?.keys).toHaveLength(2);
  });

  test('does not merge "openai"-typed keys with different base URLs', () => {
    const configs = buildBifrostProviderConfigs([
      providerKey({
        name: 'openai-main',
        settings: { provider: 'openai', apiKey: 'sk-1', baseUrl: 'https://api.openai.com/v1' },
      }),
      providerKey({
        name: 'ionos',
        settings: { provider: 'openai', apiKey: 'sk-2', baseUrl: 'https://ionos.example/v1' },
      }),
      providerKey({
        name: 'other-custom',
        settings: { provider: 'openai', apiKey: 'sk-3', baseUrl: 'https://other.example/v1' },
      }),
    ]);

    const providerIds = configs.map((config) => config.provider).sort();
    expect(providerIds).toEqual(['ionos-custom', 'openai', 'other-custom-custom']);
  });

  test('merges two "openai"-typed keys sharing the same custom base URL and name-derived id', () => {
    const configs = buildBifrostProviderConfigs([
      providerKey({
        name: 'ionos',
        settings: { provider: 'openai', apiKey: 'sk-1', baseUrl: 'https://ionos.example/v1' },
      }),
      providerKey({
        id: 'id-2',
        name: 'ionos',
        settings: { provider: 'openai', apiKey: 'sk-2', baseUrl: 'https://ionos.example/v1' },
      }),
    ]);

    expect(configs).toHaveLength(1);
    expect(configs[0]?.provider).toBe('ionos-custom');
    expect(configs[0]?.keys).toHaveLength(2);
  });
});
