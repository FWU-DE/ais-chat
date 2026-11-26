import { describe, expect, test } from 'vitest';

import { parseSyncRequest } from './schemas';

const key = (extra: object = {}) => ({
  name: 'k',
  value: 'sk-test-1',
  models: ['m'],
  weight: 1,
  ...extra,
});

const request = (
  provider: object,
  baselineProvider: object = { provider: 'p', keys: [key()] },
) => ({
  contentHash: 'h',
  providers: [provider],
  baseline: { contentHash: 'b', providers: [baselineProvider] },
});

describe('parseSyncRequest', () => {
  // Shapes that `buildBifrostProviderConfigs` produces for each provider type.
  test.each([
    [
      'azure with speech alias',
      {
        provider: 'azure',
        keys: [
          key({
            azure_key_config: { endpoint: 'https://my-res.openai.azure.com' },
            aliases: { m: { model_id: 'dep', use_speech_endpoints: true }, n: 'dep-2' },
            enabled: true,
          }),
        ],
      },
    ],
    [
      'vertex with prompt cache and credentials',
      {
        provider: 'vertex',
        prompt_cache: {
          auto_inject: true,
          cache_control_injection_points: [
            { location: 'message', role: 'system' },
            { location: 'message', role: 'user', index: -1 },
          ],
        },
        keys: [
          key({
            value: '',
            vertex_key_config: { project_id: 'p', region: 'europe-west4', auth_credentials: '{}' },
          }),
        ],
      },
    ],
    [
      'ionos with restricted requests',
      {
        provider: 'ionos',
        network_config: { base_url: 'https://ionos.example', allow_private_network: true },
        custom_provider_config: {
          base_provider_type: 'openai',
          allowed_requests: {
            list_models: true,
            chat_completion: true,
            chat_completion_stream: true,
            responses: false,
            responses_stream: false,
            embedding: true,
            image_generation: true,
          },
        },
        keys: [key()],
      },
    ],
    [
      'openai-compatible without allowed requests',
      {
        provider: 'x-custom',
        network_config: { base_url: 'https://own.example' },
        custom_provider_config: { base_provider_type: 'openai' },
        keys: [key()],
      },
    ],
    [
      'native provider with an unknown field',
      { provider: 'mistral', keys: [key({ extra: 1 })], future: true },
    ],
  ])('accepts %s', (_name, provider) => {
    expect(parseSyncRequest(request(provider)).ok).toBe(true);
  });

  test('keeps unknown fields, so a newer Bifrost field is not dropped', () => {
    const parsed = parseSyncRequest(
      request({ provider: 'p', keys: [key({ extra: 1 })], future: true }),
    );

    expect(
      parsed.ok && (parsed.request.providers[0] as unknown as { future: boolean }).future,
    ).toBe(true);
  });

  test.each([
    [
      'an alias that is null',
      { provider: 'p', keys: [key({ aliases: { m: null } })] },
      'providers.0.keys.0.aliases.m',
    ],
    [
      'an empty alias',
      { provider: 'p', keys: [key({ aliases: { m: '' } })] },
      'providers.0.keys.0.aliases.m',
    ],
    [
      'an alias object without model_id',
      { provider: 'p', keys: [key({ aliases: { m: { use_speech_endpoints: true } } })] },
      'providers.0.keys.0.aliases.m',
    ],
    [
      'aliases as an array',
      { provider: 'p', keys: [key({ aliases: ['m'] })] },
      'providers.0.keys.0.aliases',
    ],
    [
      'an azure config without endpoint',
      { provider: 'p', keys: [key({ azure_key_config: {} })] },
      'providers.0.keys.0.azure_key_config.endpoint',
    ],
    [
      'a vertex config without region',
      { provider: 'p', keys: [key({ vertex_key_config: { project_id: 'p' } })] },
      'providers.0.keys.0.vertex_key_config.region',
    ],
    [
      'a network_config that is a string',
      { provider: 'p', keys: [key()], network_config: 'http://x' },
      'providers.0.network_config',
    ],
    [
      'a base_url that is a number',
      { provider: 'p', keys: [key()], network_config: { base_url: 5 } },
      'providers.0.network_config.base_url',
    ],
    [
      'an unknown custom provider type',
      { provider: 'p', keys: [key()], custom_provider_config: { base_provider_type: 'anthropic' } },
      'providers.0.custom_provider_config.base_provider_type',
    ],
    [
      'allowed_requests with a non-boolean',
      {
        provider: 'p',
        keys: [key()],
        custom_provider_config: {
          base_provider_type: 'openai',
          allowed_requests: { list_models: 'yes' },
        },
      },
      'providers.0.custom_provider_config.allowed_requests',
    ],
    [
      'a prompt cache without auto_inject',
      { provider: 'p', keys: [key()], prompt_cache: { ttl: '1h' } },
      'providers.0.prompt_cache.auto_inject',
    ],
    [
      'an injection point with an unknown location',
      {
        provider: 'p',
        keys: [key()],
        prompt_cache: { auto_inject: true, cache_control_injection_points: [{ location: 'tool' }] },
      },
      'providers.0.prompt_cache.cache_control_injection_points.0.location',
    ],
  ])('rejects %s in the desired state', (_name, provider, path) => {
    const parsed = parseSyncRequest(request(provider));

    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.issues.join(' ')).toContain(path);
  });

  test('rejects the same malformed field in the baseline, before any write', () => {
    const parsed = parseSyncRequest(
      request(
        { provider: 'p', keys: [key()] },
        { provider: 'p', keys: [key({ aliases: { m: null } })] },
      ),
    );

    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.issues.join(' ')).toContain(
      'baseline.providers.0.keys.0.aliases.m',
    );
  });

  test('issues name the field and never contain the key values', () => {
    const parsed = parseSyncRequest(
      request({
        provider: 'p',
        keys: [key({ value: 'sk-test-secret-value', aliases: { m: null } })],
      }),
    );

    expect(parsed.ok).toBe(false);
    expect(JSON.stringify(parsed)).not.toContain('sk-test-secret-value');
  });
});
