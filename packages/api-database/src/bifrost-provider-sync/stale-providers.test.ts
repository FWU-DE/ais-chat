import { beforeEach, describe, expect, test, vi } from 'vitest';

import { deleteStaleManagedProviders } from './stale-providers';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('deleteStaleManagedProviders', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('deletes the providers that are not configured and keeps the others', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ providers: [{ name: 'azure' }, { name: 'old' }] }))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await deleteStaleManagedProviders([{ provider: 'azure', keys: [] }], {
      bifrostAdminUrl: 'http://localhost:8080',
    });

    const calls = (fetchMock.mock.calls as [URL, RequestInit][]).map(
      ([url, init]) => `${init.method} ${url.pathname}`,
    );
    expect(calls).toEqual(['GET /api/providers', 'DELETE /api/providers/old']);
  });

  test('requires the Bifrost admin URL at compile time', () => {
    // A call without the URL used to compile and then failed with "Invalid URL" at runtime.
    const withoutUrl = () =>
      // @ts-expect-error `bifrostAdminUrl` is required
      deleteStaleManagedProviders([], {});
    expect(withoutUrl).toBeTypeOf('function');
  });
});
