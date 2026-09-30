import { describe, test, expect, vi, beforeEach } from 'vitest';
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
});
