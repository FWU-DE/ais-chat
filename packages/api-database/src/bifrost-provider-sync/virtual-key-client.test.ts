import { beforeEach, describe, expect, test, vi } from 'vitest';

import { listBifrostVirtualKeys, updateBifrostVirtualKeyProviders } from './virtual-key-client';

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('listBifrostVirtualKeys', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('returns all virtual keys from a single page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        virtual_keys: [{ id: 'vk-all', provider_configs: [] }],
        count: 1,
        total_count: 1,
        limit: 100,
        offset: 0,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const virtualKeys = await listBifrostVirtualKeys({
      bifrostAdminUrl: 'http://localhost:8080',
      bifrostAdminUsername: 'admin',
      bifrostAdminPassword: 'secret',
    });

    expect(virtualKeys).toEqual([{ id: 'vk-all', provider_configs: [] }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      'http://localhost:8080/api/governance/virtual-keys?limit=100&offset=0',
    );
    expect(init.headers).toMatchObject({ Authorization: 'Basic YWRtaW46c2VjcmV0' });
  });

  test('paginates until every virtual key has been collected', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          virtual_keys: [{ id: 'vk-1', provider_configs: [] }],
          count: 1,
          total_count: 2,
          limit: 1,
          offset: 0,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          virtual_keys: [{ id: 'vk-2', provider_configs: [] }],
          count: 1,
          total_count: 2,
          limit: 1,
          offset: 1,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const virtualKeys = await listBifrostVirtualKeys({
      bifrostAdminUrl: 'http://localhost:8080',
    });

    expect(virtualKeys.map((virtualKey) => virtualKey.id)).toEqual(['vk-1', 'vk-2']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('stops paginating once an empty page is returned', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        virtual_keys: [],
        count: 0,
        total_count: 5,
        limit: 100,
        offset: 0,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const virtualKeys = await listBifrostVirtualKeys({
      bifrostAdminUrl: 'http://localhost:8080',
    });

    expect(virtualKeys).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('throws when Bifrost responds with an error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, { status: 500 })),
    );

    await expect(
      listBifrostVirtualKeys({ bifrostAdminUrl: 'http://localhost:8080' }),
    ).rejects.toThrow('BIFROST_PROVIDER_SYNC_FAILED');
  });
});

describe('updateBifrostVirtualKeyProviders', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('sends a PUT request with the provider configs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await updateBifrostVirtualKeyProviders({
      bifrostAdminUrl: 'http://localhost:8080',
      bifrostAdminUsername: 'admin',
      bifrostAdminPassword: 'secret',
      virtualKeyId: 'vk-all',
      providerConfigs: [{ provider: 'azure', allowed_models: ['gpt-4o'], key_ids: ['*'] }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('http://localhost:8080/api/governance/virtual-keys/vk-all');
    expect(init.method).toBe('PUT');
    expect(init.headers).toMatchObject({ Authorization: 'Basic YWRtaW46c2VjcmV0' });
    expect(JSON.parse(init.body as string)).toEqual({
      provider_configs: [{ provider: 'azure', allowed_models: ['gpt-4o'], key_ids: ['*'] }],
    });
  });
});
