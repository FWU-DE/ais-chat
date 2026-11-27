import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { syncAll } from './bifrost-sync-core';
import type { SyncRequest } from './schemas';
import { keyOf } from './test/fake-bifrost';
import { createHarness, type Harness } from './test/harness';
import { verifyState } from './verify';

type Providers = SyncRequest['providers'];

let h: Harness;

const target = () => ({
  baseUrl: h.cluster.podByName('bifrost-a').baseUrl,
  username: 'admin',
  password: 'admin-test-password',
});

const providers = (): Providers => [
  {
    provider: 'custom-a',
    network_config: { base_url: 'https://upstream.example', allow_private_network: false },
    custom_provider_config: {
      base_provider_type: 'openai',
      allowed_requests: {
        list_models: false,
        chat_completion: true,
        chat_completion_stream: true,
        responses: false,
        responses_stream: false,
        embedding: false,
        image_generation: false,
      },
    },
    keys: [{ ...keyOf('k1', 'sk-test-v-1', ['m1', 'm2']), weight: 0.5, enabled: true }],
  },
  { provider: 'openai', keys: [keyOf('k2', 'sk-test-v-2', ['fast'])] },
];

beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.close());

describe('verifyState', () => {
  test('reports no difference although the server adds defaults of its own', async () => {
    expect(await syncAll(target(), providers())).toEqual([]);

    // The read back carries `max_conns_per_host`, `stream_idle_timeout_in_seconds`,
    // `keep_alive_timeout_in_seconds`, key `status` and `description`, `allow_all_keys` and more.
    const providerRead = await fetch(`${target().baseUrl}/api/providers/custom-a`, {
      headers: {
        authorization: `Basic ${Buffer.from('admin:admin-test-password').toString('base64')}`,
      },
    });
    const body = (await providerRead.json()) as { network_config: Record<string, unknown> };
    expect(body.network_config).toHaveProperty('max_conns_per_host');
    expect(body.network_config).toHaveProperty('stream_idle_timeout_in_seconds');
    expect(body.network_config).toHaveProperty('keep_alive_timeout_in_seconds');

    expect(await verifyState(target(), providers())).toEqual([]);
  });

  test('reports no difference for a key with an alias and models in another order', async () => {
    const desired = providers();
    desired[0]!.keys[0] = {
      ...desired[0]!.keys[0]!,
      models: ['m2', 'm1'],
      aliases: { m1: 'up-1', m2: { model_id: 'up-2' } },
    };
    await syncAll(target(), desired);

    expect(await verifyState(target(), desired)).toEqual([]);
  });

  test('does not compare key values, which Bifrost returns masked', async () => {
    await syncAll(target(), providers());
    const desired = providers();
    desired[0]!.keys[0]!.value = 'sk-test-a-different-value';

    expect(await verifyState(target(), desired)).toEqual([]);
  });

  test('reports a differing weight', async () => {
    await syncAll(target(), providers());
    const desired = providers();
    desired[0]!.keys[0]!.weight = 3;

    expect(await verifyState(target(), desired)).toEqual([
      { provider: 'custom-a', step: 'verify', message: 'key k1: weight differs' },
    ]);
  });

  test('reports a missing model', async () => {
    await syncAll(target(), providers());
    const desired = providers();
    desired[0]!.keys[0]!.models = ['m1', 'm2', 'm3'];

    const errors = await verifyState(target(), desired);

    expect(errors).toContainEqual({
      provider: 'custom-a',
      step: 'verify',
      message: 'key k1: models differ',
    });
  });

  test('reports a missing key', async () => {
    await syncAll(target(), providers());
    const desired = providers();
    desired[1]!.keys.push(keyOf('k-new', 'sk-test-v-3'));

    expect(await verifyState(target(), desired)).toContainEqual({
      provider: 'openai',
      step: 'verify',
      message: 'key k-new is missing',
    });
  });

  test('reports a key that should not exist and a provider that should not exist', async () => {
    await syncAll(target(), providers());
    const desired = providers().slice(0, 1);
    desired[0]!.keys = [];

    const errors = await verifyState(target(), desired);

    expect(errors).toContainEqual({
      provider: 'custom-a',
      step: 'verify',
      message: 'key k1 should not exist',
    });
    expect(errors).toContainEqual({
      provider: 'openai',
      step: 'verify',
      message: 'provider should not exist',
    });
  });

  test('reports a differing enabled flag', async () => {
    await syncAll(target(), providers());
    const desired = providers();
    desired[0]!.keys[0]!.enabled = false;

    expect(await verifyState(target(), desired)).toContainEqual({
      provider: 'custom-a',
      step: 'verify',
      message: 'key k1: enabled differs',
    });
  });

  test('reports a differing base_url', async () => {
    await syncAll(target(), providers());
    const desired = providers();
    desired[0]!.network_config = { base_url: 'https://other.example' };

    expect(await verifyState(target(), desired)).toContainEqual({
      provider: 'custom-a',
      step: 'verify',
      message: 'network_config.base_url differs',
    });
  });

  test('ignores the network config when the desired config omits it', async () => {
    await syncAll(target(), providers());

    expect(await verifyState(target(), providers().slice(1))).not.toContainEqual(
      expect.objectContaining({
        provider: 'openai',
        message: expect.stringContaining('network_config'),
      }),
    );
  });

  test('reports a custom provider config that cannot be removed', async () => {
    await syncAll(target(), providers());
    const desired = providers();
    delete desired[0]!.custom_provider_config;

    expect(await verifyState(target(), desired)).toContainEqual({
      provider: 'custom-a',
      step: 'verify',
      message: 'custom_provider_config cannot be removed',
    });
  });

  test('reports differing allowed requests', async () => {
    await syncAll(target(), providers());
    const desired = providers();
    desired[0]!.custom_provider_config!.allowed_requests!.embedding = true;

    expect(await verifyState(target(), desired)).toContainEqual({
      provider: 'custom-a',
      step: 'verify',
      message: 'custom_provider_config.allowed_requests differs',
    });
  });

  test('reports virtual key access that is missing or differs', async () => {
    await syncAll(target(), providers());
    const desired = providers();
    desired[1]!.keys[0]!.models = ['fast', 'extra'];
    h.cluster.podByName('bifrost-a').memory.virtualKeys[0]!.provider_configs = [];

    const errors = await verifyState(target(), desired);

    expect(errors).toContainEqual({
      provider: 'openai',
      step: 'verify',
      message: 'virtual key vk-all: access is missing',
    });
  });

  test('reports allowed models of a virtual key that differ', async () => {
    await syncAll(target(), providers());
    const desired = providers();
    desired[1]!.keys[0]!.models = ['fast', 'extra'];

    expect(await verifyState(target(), desired)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'openai', message: 'key k2: models differ' }),
        expect.objectContaining({
          provider: 'openai',
          message: 'virtual key vk-all: allowed_models differ',
        }),
      ]),
    );
  });

  test('a read that fails is an error', async () => {
    h.cluster.podByName('bifrost-a').healthy = false;

    const errors = await verifyState(target(), providers());

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ provider: '*', step: 'verify' });
    expect(errors[0]!.message).toContain('read back failed');
  });

  test('error texts never contain key values', async () => {
    await syncAll(target(), providers());
    const desired = providers();
    desired[0]!.keys[0]!.weight = 9;

    const text = JSON.stringify(await verifyState(target(), desired));

    expect(text).not.toContain('sk-test');
  });

  describe('routing fields', () => {
    const withAliases = (): Providers => [
      {
        provider: 'azure',
        keys: [
          {
            ...keyOf('az', 'sk-test-az-1', ['m1', 'm2', 'm3']),
            azure_key_config: { endpoint: 'https://my-res.openai.azure.com' },
            aliases: {
              m1: 'dep-1',
              m2: { model_id: 'dep-2', use_speech_endpoints: true },
              m3: { model_id: 'dep-3' },
            },
          },
        ],
      },
    ];

    test('reports no difference although Bifrost returns an object without speech flag as a string', async () => {
      await syncAll(target(), withAliases());

      expect(await verifyState(target(), withAliases())).toEqual([]);
    });

    test('reports no difference for a key without aliases, which Bifrost returns as null', async () => {
      const desired = withAliases();
      desired[0]!.keys[0]!.aliases = {};
      await syncAll(target(), desired);

      expect(await verifyState(target(), desired)).toEqual([]);
    });

    test('reports a wrong upstream model in an alias', async () => {
      await syncAll(target(), withAliases());
      const desired = withAliases();
      desired[0]!.keys[0]!.aliases!.m1 = 'dep-other';

      expect(await verifyState(target(), desired)).toContainEqual({
        provider: 'azure',
        step: 'verify',
        message: 'key az: aliases differ',
      });
    });

    test('reports a missing alias and a lost speech flag', async () => {
      await syncAll(target(), withAliases());
      const missing = withAliases();
      delete missing[0]!.keys[0]!.aliases!.m1;
      const noSpeech = withAliases();
      noSpeech[0]!.keys[0]!.aliases!.m2 = { model_id: 'dep-2' };

      for (const desired of [missing, noSpeech]) {
        expect(await verifyState(target(), desired)).toContainEqual({
          provider: 'azure',
          step: 'verify',
          message: 'key az: aliases differ',
        });
      }
    });

    test('reports a differing Azure endpoint and ignores a trailing slash', async () => {
      await syncAll(target(), withAliases());
      const slash = withAliases();
      slash[0]!.keys[0]!.azure_key_config = { endpoint: 'https://my-res.openai.azure.com/' };
      const other = withAliases();
      other[0]!.keys[0]!.azure_key_config = { endpoint: 'https://other.openai.azure.com' };

      expect(await verifyState(target(), slash)).toEqual([]);
      expect(await verifyState(target(), other)).toContainEqual({
        provider: 'azure',
        step: 'verify',
        message: 'key az: azure_key_config.endpoint differs',
      });
    });

    test('reports a differing Vertex region and does not compare the masked project', async () => {
      const vertex = (region: string, project: string): Providers => [
        {
          provider: 'vertex',
          keys: [
            {
              ...keyOf('vx', '', ['g']),
              vertex_key_config: { project_id: project, region, auth_credentials: '{}' },
            },
          ],
        },
      ];
      await syncAll(target(), vertex('europe-west4', 'proj-1'));

      expect(await verifyState(target(), vertex('europe-west4', 'proj-other'))).toEqual([]);
      expect(await verifyState(target(), vertex('us-east1', 'proj-1'))).toContainEqual({
        provider: 'vertex',
        step: 'verify',
        message: 'key vx: vertex_key_config.region differs',
      });
    });
  });

  describe('custom provider requests and prompt cache', () => {
    const custom = (allowedRequests?: Record<string, boolean>): Providers => [
      {
        provider: 'cp',
        network_config: { base_url: 'https://upstream.example' },
        custom_provider_config: {
          base_provider_type: 'openai',
          ...(allowedRequests
            ? {
                allowed_requests: allowedRequests as NonNullable<
                  Providers[number]['custom_provider_config']
                >['allowed_requests'],
              }
            : {}),
        },
        keys: [keyOf('k', 'sk-test-cp-1', ['m'])],
      },
    ];
    const restricted = { chat_completion: true, embedding: true, responses: false };

    test('reports no difference when neither side restricts the requests', async () => {
      await syncAll(target(), custom());

      expect(await verifyState(target(), custom())).toEqual([]);
    });

    test('reports a restriction that Bifrost still has although the desired config omits it', async () => {
      await syncAll(target(), custom(restricted));
      // Bifrost keeps what was written; the desired state (unrestricted) differs from it.
      const errors = await verifyState(target(), custom());

      expect(errors).toContainEqual({
        provider: 'cp',
        step: 'verify',
        message: 'custom_provider_config.allowed_requests differs',
      });
    });

    test('reports a missing restriction and different restrictions', async () => {
      await syncAll(target(), custom());
      const other = { chat_completion: true, embedding: false };

      for (const desired of [custom(restricted), custom(other)]) {
        await syncAll(target(), custom());
        expect(await verifyState(target(), desired)).toContainEqual({
          provider: 'cp',
          step: 'verify',
          message: 'custom_provider_config.allowed_requests differs',
        });
      }
    });

    test('a restriction that allows nothing is not the same as no restriction', async () => {
      const nothing = {
        list_models: false,
        chat_completion: false,
        chat_completion_stream: false,
        responses: false,
        responses_stream: false,
        embedding: false,
        image_generation: false,
      };
      // Bifrost has no restriction (the field is absent), but the desired config forbids every request.
      await syncAll(target(), custom());

      expect(await verifyState(target(), custom(nothing))).toContainEqual({
        provider: 'cp',
        step: 'verify',
        message: 'custom_provider_config.allowed_requests differs',
      });
    });

    test('a rollback that omits the restriction lifts it, and the read back accepts that', async () => {
      await syncAll(target(), custom(restricted));
      await syncAll(target(), custom());

      expect(await verifyState(target(), custom())).toEqual([]);
    });

    const cached = (autoInject: boolean): Providers => [
      {
        provider: 'vertex',
        prompt_cache: {
          auto_inject: autoInject,
          cache_control_injection_points: [
            { location: 'message', role: 'system' },
            { location: 'message', role: 'user', index: -1 },
          ],
        },
        keys: [keyOf('vx', '', ['g'])],
      },
    ];

    test('reports no difference for an equal prompt cache config', async () => {
      await syncAll(target(), cached(true));

      expect(await verifyState(target(), cached(true))).toEqual([]);
    });

    test('reports a lost auto_inject flag and a changed injection point', async () => {
      await syncAll(target(), cached(false));
      const changedPoint = cached(false);
      changedPoint[0]!.prompt_cache!.auto_inject = true;
      changedPoint[0]!.prompt_cache!.cache_control_injection_points![1]!.index = 0;

      expect(await verifyState(target(), cached(true))).toContainEqual({
        provider: 'vertex',
        step: 'verify',
        message: 'prompt_cache differs',
      });
      expect(await verifyState(target(), changedPoint)).toContainEqual({
        provider: 'vertex',
        step: 'verify',
        message: 'prompt_cache differs',
      });
    });

    test('does not compare the prompt cache when the desired config omits it', async () => {
      await syncAll(target(), cached(true));
      const omitted = cached(true);
      delete omitted[0]!.prompt_cache;

      expect(await verifyState(target(), omitted)).toEqual([]);
    });
  });
});
