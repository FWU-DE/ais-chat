import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDiscoveryRequest, mockProcessDiscoveryResponse, mockEnv } = vi.hoisted(() => ({
  mockDiscoveryRequest: vi.fn(),
  mockProcessDiscoveryResponse: vi.fn(),
  mockEnv: {
    vidisClientId: 'chat-client',
    vidisClientSecret: 'client-secret',
    vidisIssuerUri: 'http://localhost:8080/realms/ais-chat-local',
    vidisAllowInsecureDiscovery: false,
  },
}));

vi.mock('@/env', () => ({ env: mockEnv }));

vi.mock('@ais-chat/shared/db/functions/user', () => ({
  dbGetUserById: vi.fn(),
}));

vi.mock('@shared/db/functions/federal-state', () => ({
  dbGetFederalStateById: vi.fn(),
}));

vi.mock('next-auth', () => ({
  customFetch: Symbol('customFetch'),
}));

vi.mock('oauth4webapi', async (importOriginal) => {
  const original = await importOriginal<typeof import('oauth4webapi')>();
  return {
    ...original,
    discoveryRequest: mockDiscoveryRequest,
    processDiscoveryResponse: mockProcessDiscoveryResponse,
  };
});

describe('getVidisJwks', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockEnv.vidisAllowInsecureDiscovery = false;
  });

  it('allows insecure discovery when VIDIS_ALLOW_INSECURE_DISCOVERY is set', async () => {
    mockEnv.vidisAllowInsecureDiscovery = true;
    const discoveryResponse = new Response();
    mockDiscoveryRequest.mockResolvedValue(discoveryResponse);
    mockProcessDiscoveryResponse.mockResolvedValue({
      jwks_uri: 'http://localhost:8080/realms/ais-chat-local/protocol/openid-connect/certs',
    });

    const { allowInsecureRequests } = await import('oauth4webapi');
    const { getVidisJwks } = await import('./vidis-provider');
    await getVidisJwks();

    expect(mockDiscoveryRequest).toHaveBeenCalledWith(
      new URL('http://localhost:8080/realms/ais-chat-local'),
      expect.objectContaining({ [allowInsecureRequests]: true }),
    );
  });

  it('disallows insecure discovery by default', async () => {
    const discoveryResponse = new Response();
    mockDiscoveryRequest.mockResolvedValue(discoveryResponse);
    mockProcessDiscoveryResponse.mockResolvedValue({
      jwks_uri: 'https://localhost:8080/realms/ais-chat-local/protocol/openid-connect/certs',
    });

    const { allowInsecureRequests } = await import('oauth4webapi');
    const { getVidisJwks } = await import('./vidis-provider');
    await getVidisJwks();

    expect(mockDiscoveryRequest).toHaveBeenCalledWith(
      new URL('http://localhost:8080/realms/ais-chat-local'),
      expect.objectContaining({ [allowInsecureRequests]: false }),
    );
  });

  it('rejects an insecure jwks_uri by default', async () => {
    const discoveryResponse = new Response();
    mockDiscoveryRequest.mockResolvedValue(discoveryResponse);
    mockProcessDiscoveryResponse.mockResolvedValue({
      jwks_uri: 'http://localhost:8080/realms/ais-chat-local/protocol/openid-connect/certs',
    });

    const { getVidisJwks } = await import('./vidis-provider');

    await expect(getVidisJwks()).rejects.toThrow(
      'Refusing to fetch VIDIS JWKS over an insecure connection',
    );
  });

  it('allows an insecure jwks_uri when VIDIS_ALLOW_INSECURE_DISCOVERY is set', async () => {
    mockEnv.vidisAllowInsecureDiscovery = true;
    const discoveryResponse = new Response();
    mockDiscoveryRequest.mockResolvedValue(discoveryResponse);
    mockProcessDiscoveryResponse.mockResolvedValue({
      jwks_uri: 'http://localhost:8080/realms/ais-chat-local/protocol/openid-connect/certs',
    });

    const { getVidisJwks } = await import('./vidis-provider');

    await expect(getVidisJwks()).resolves.toBeDefined();
  });
});
