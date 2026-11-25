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
});
