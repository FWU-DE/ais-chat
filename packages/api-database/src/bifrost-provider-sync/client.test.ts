import { beforeEach, describe, expect, test, vi } from 'vitest';

import { syncBifrostProvider } from './client';
import type { BifrostProviderConfig } from './types';

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('syncBifrostProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('percent-encodes a provider id containing path-traversal characters', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 404 })) // GET provider -> not found
      .mockResolvedValueOnce(jsonResponse({ message: 'ok' })) // POST create provider
      .mockResolvedValueOnce(jsonResponse({ keys: [] })); // GET existing keys
    vi.stubGlobal('fetch', fetchMock);

    const providerConfig: BifrostProviderConfig = {
      provider: '../../governance/virtual-keys',
      keys: [],
    };

    await syncBifrostProvider({
      bifrostAdminUrl: 'http://localhost:8080',
      providerConfig,
    });

    const requestedUrls = (fetchMock.mock.calls as [URL][]).map(([url]) => url.toString());
    // The provider-scoped requests (GET provider, GET keys) must encode the provider id; the
    // provider-creation POST intentionally targets the collection endpoint without an id.
    const providerScopedUrls = requestedUrls.filter(
      (url) => url !== 'http://localhost:8080/api/providers',
    );
    expect(providerScopedUrls.length).toBeGreaterThan(0);
    for (const url of providerScopedUrls) {
      expect(url).toContain('/api/providers/..%2F..%2Fgovernance%2Fvirtual-keys');
      expect(url).not.toContain('/api/governance/virtual-keys');
    }
  });

  test('sends the prompt cache config when updating an existing provider', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ name: 'vertex' })) // GET provider -> exists
      .mockResolvedValueOnce(jsonResponse({ message: 'ok' })) // PUT update provider
      .mockResolvedValueOnce(jsonResponse({ keys: [] })); // GET existing keys
    vi.stubGlobal('fetch', fetchMock);

    const promptCache: BifrostProviderConfig['prompt_cache'] = {
      auto_inject: true,
      cache_control_injection_points: [{ location: 'message', role: 'system' }],
    };

    await syncBifrostProvider({
      bifrostAdminUrl: 'http://localhost:8080',
      providerConfig: { provider: 'vertex', prompt_cache: promptCache, keys: [] },
    });

    const putCall = (fetchMock.mock.calls as [URL, RequestInit][]).find(
      ([, init]) => init.method === 'PUT',
    );
    expect(JSON.parse(putCall?.[1].body as string)).toMatchObject({ prompt_cache: promptCache });
  });

  const putBody = (fetchMock: ReturnType<typeof vi.fn>) => {
    const call = (fetchMock.mock.calls as [URL, RequestInit][]).find(
      ([url, init]) => init.method === 'PUT' && url.pathname === '/api/providers/openai',
    );
    return JSON.parse(call?.[1].body as string) as Record<string, unknown>;
  };

  const existingProvider = {
    name: 'openai',
    network_config: { base_url: 'https://target.example/v1' },
    concurrency_and_buffer_size: { concurrency: 10, buffer_size: 10 },
  };

  test('keeps the current network config when the config omits it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(existingProvider))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ keys: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await syncBifrostProvider({
      bifrostAdminUrl: 'http://localhost:8080',
      providerConfig: { provider: 'openai', keys: [] },
    });

    expect(putBody(fetchMock).network_config).toEqual(existingProvider.network_config);
  });

  test('authoritative mode drops the current network config when the config omits it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(existingProvider))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ keys: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await syncBifrostProvider({
      bifrostAdminUrl: 'http://localhost:8080',
      providerConfig: { provider: 'openai', keys: [] },
      authoritative: true,
    });

    const body = putBody(fetchMock);
    expect(body).not.toHaveProperty('network_config');
    expect(body.concurrency_and_buffer_size).toEqual(existingProvider.concurrency_and_buffer_size);
  });

  test('authoritative mode still sends the network config of the config', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(existingProvider))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ keys: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await syncBifrostProvider({
      bifrostAdminUrl: 'http://localhost:8080',
      providerConfig: {
        provider: 'openai',
        network_config: { base_url: 'https://baseline.example/v1' },
        keys: [],
      },
      authoritative: true,
    });

    expect(putBody(fetchMock).network_config).toEqual({ base_url: 'https://baseline.example/v1' });
  });

  test('waits for all key writes to settle before it rejects', async () => {
    let releaseSlowWrite!: () => void;
    const slowWrite = new Promise<Response>((resolve) => {
      releaseSlowWrite = () => resolve(jsonResponse({}));
    });
    let slowWriteSettled = false;
    const fetchMock = vi.fn((url: URL, init: RequestInit) => {
      if (init.method === 'GET' && url.pathname === '/api/providers/openai') {
        return Promise.resolve(jsonResponse(existingProvider));
      }
      if (init.method === 'PUT' && url.pathname === '/api/providers/openai') {
        return Promise.resolve(jsonResponse({}));
      }
      if (init.method === 'GET') return Promise.resolve(jsonResponse({ keys: [] }));
      const body = JSON.parse(init.body as string) as { name: string };
      if (body.name === 'fails') return Promise.resolve(jsonResponse({}, { status: 500 }));
      return slowWrite.then((response) => {
        slowWriteSettled = true;
        return response;
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const sync = syncBifrostProvider({
      bifrostAdminUrl: 'http://localhost:8080',
      providerConfig: {
        provider: 'openai',
        keys: [
          { name: 'fails', value: 'sk-test', models: [], weight: 1 },
          { name: 'slow', value: 'sk-test', models: [], weight: 1 },
        ],
      },
    });
    let rejected = false;
    sync.catch(() => {
      rejected = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(rejected).toBe(false);

    releaseSlowWrite();
    await expect(sync).rejects.toThrow('BIFROST_PROVIDER_SYNC_FAILED');
    expect(slowWriteSettled).toBe(true);
  });
});
