import { describe, test, expect, vi, beforeEach } from 'vitest';
import { ensureBifrostVirtualKeyProviderAccess } from './virtual-key-sync';
import { dbGetAllProviderKeysWithModels } from '../functions';
import { buildBifrostProviderConfigs } from './provider-config-builder';
import { listBifrostVirtualKeys, updateBifrostVirtualKeyProviders } from './virtual-key-client';
import type { BifrostProviderConfig, BifrostVirtualKey } from './types';

vi.mock('../functions', () => ({
  dbGetAllProviderKeysWithModels: vi.fn(),
}));

vi.mock('./provider-config-builder', () => ({
  buildBifrostProviderConfigs: vi.fn(),
}));

vi.mock('./virtual-key-client', () => ({
  listBifrostVirtualKeys: vi.fn(),
  updateBifrostVirtualKeyProviders: vi.fn(),
}));

const authoritativeProviderConfigs: BifrostProviderConfig[] = [
  {
    provider: 'azure',
    keys: [
      { name: 'azure-1', value: 'secret', models: ['gpt-4o', 'gpt-4o'], weight: 1 },
      { name: 'azure-2', value: 'secret', models: ['gpt-4o-mini'], weight: 1 },
    ],
  },
  {
    provider: 'openai',
    keys: [{ name: 'openai-1', value: 'secret', models: ['o3'], weight: 1 }],
  },
];

function options() {
  return {
    bifrostAdminUrl: 'http://localhost:8080',
    bifrostAdminUsername: 'admin',
    bifrostAdminPassword: 'secret',
  };
}

function getUpdateCallArgs(callIndex = 0): Parameters<typeof updateBifrostVirtualKeyProviders>[0] {
  return vi.mocked(updateBifrostVirtualKeyProviders).mock.calls[callIndex]![0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbGetAllProviderKeysWithModels).mockResolvedValue([]);
  vi.mocked(buildBifrostProviderConfigs).mockReturnValue(authoritativeProviderConfigs);
  vi.mocked(updateBifrostVirtualKeyProviders).mockResolvedValue(undefined);
});

describe('ensureBifrostVirtualKeyProviderAccess', () => {
  test('adds provider entries for a virtual key with no existing provider configs', async () => {
    const virtualKey: BifrostVirtualKey = { id: 'vk-all', provider_configs: [] };
    vi.mocked(listBifrostVirtualKeys).mockResolvedValue([virtualKey]);

    await ensureBifrostVirtualKeyProviderAccess(options());

    const call = getUpdateCallArgs();
    expect(call.virtualKeyId).toBe('vk-all');

    const azureConfig = call.providerConfigs.find((config) => config.provider === 'azure');
    expect(azureConfig?.allowed_models).toEqual(expect.arrayContaining(['gpt-4o', 'gpt-4o-mini']));
    expect(azureConfig?.key_ids).toEqual(['*']);

    const openaiConfig = call.providerConfigs.find((config) => config.provider === 'openai');
    expect(openaiConfig?.allowed_models).toEqual(['o3']);
    expect(openaiConfig?.key_ids).toEqual(['*']);
  });

  test('preserves id/weight/budgets on existing matched provider entries', async () => {
    const virtualKey: BifrostVirtualKey = {
      id: 'vk-all',
      provider_configs: [
        {
          id: 42,
          provider: 'azure',
          allowed_models: ['stale-model'],
          weight: 0.5,
          budgets: [{ max_limit: 100 }],
        },
      ],
    };
    vi.mocked(listBifrostVirtualKeys).mockResolvedValue([virtualKey]);

    await ensureBifrostVirtualKeyProviderAccess(options());

    const call = getUpdateCallArgs();
    const azureConfig = call.providerConfigs.find((config) => config.provider === 'azure');
    expect(azureConfig?.id).toBe(42);
    expect(azureConfig?.weight).toBe(0.5);
    expect(azureConfig?.budgets).toEqual([{ max_limit: 100 }]);
    expect(azureConfig?.allowed_models).toEqual(expect.arrayContaining(['gpt-4o', 'gpt-4o-mini']));
    expect(azureConfig?.key_ids).toEqual(['*']);
  });

  test('drops managed providers no longer used by any model', async () => {
    const virtualKey: BifrostVirtualKey = {
      id: 'vk-all',
      provider_configs: [
        { provider: 'azure', allowed_models: [] },
        { provider: 'vertex', allowed_models: ['old-vertex-model'] },
      ],
    };
    vi.mocked(listBifrostVirtualKeys).mockResolvedValue([virtualKey]);

    await ensureBifrostVirtualKeyProviderAccess(options());

    const call = getUpdateCallArgs();
    expect(call.providerConfigs.some((config) => config.provider === 'vertex')).toBe(false);
  });

  test('leaves provider configs for unmanaged providers untouched', async () => {
    const virtualKey: BifrostVirtualKey = {
      id: 'vk-all',
      provider_configs: [{ provider: 'anthropic', allowed_models: ['claude-3-opus'] }],
    };
    vi.mocked(listBifrostVirtualKeys).mockResolvedValue([virtualKey]);

    await ensureBifrostVirtualKeyProviderAccess(options());

    const call = getUpdateCallArgs();
    expect(call.providerConfigs).toContainEqual({
      provider: 'anthropic',
      allowed_models: ['claude-3-opus'],
    });
  });

  test('skips the update call when provider access is already correct', async () => {
    const virtualKey: BifrostVirtualKey = {
      id: 'vk-all',
      provider_configs: [
        { provider: 'azure', allowed_models: ['gpt-4o-mini', 'gpt-4o'], key_ids: ['*'] },
        { provider: 'openai', allowed_models: ['o3'], key_ids: ['*'] },
      ],
    };
    vi.mocked(listBifrostVirtualKeys).mockResolvedValue([virtualKey]);

    await ensureBifrostVirtualKeyProviderAccess(options());

    expect(updateBifrostVirtualKeyProviders).not.toHaveBeenCalled();
  });

  test('processes multiple virtual keys independently', async () => {
    const virtualKeys: BifrostVirtualKey[] = [
      { id: 'vk-1', provider_configs: [] },
      { id: 'vk-2', provider_configs: [] },
    ];
    vi.mocked(listBifrostVirtualKeys).mockResolvedValue(virtualKeys);

    await ensureBifrostVirtualKeyProviderAccess(options());

    expect(updateBifrostVirtualKeyProviders).toHaveBeenCalledTimes(2);
    expect([0, 1].map((index) => getUpdateCallArgs(index).virtualKeyId)).toEqual(['vk-1', 'vk-2']);
  });

  test('continues syncing remaining virtual keys and throws if one fails', async () => {
    const virtualKeys: BifrostVirtualKey[] = [
      { id: 'vk-1', provider_configs: [] },
      { id: 'vk-2', provider_configs: [] },
    ];
    vi.mocked(listBifrostVirtualKeys).mockResolvedValue(virtualKeys);
    vi.mocked(updateBifrostVirtualKeyProviders).mockRejectedValueOnce(new Error('boom'));

    await expect(ensureBifrostVirtualKeyProviderAccess(options())).rejects.toThrow(
      'BIFROST_PROVIDER_SYNC_FAILED',
    );

    expect(updateBifrostVirtualKeyProviders).toHaveBeenCalledTimes(2);
  });
});
