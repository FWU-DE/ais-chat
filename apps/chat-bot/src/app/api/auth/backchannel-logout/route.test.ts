import { createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload, SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetVidisJwks, mockSessionBlockListAdd } = vi.hoisted(() => ({
  mockGetVidisJwks: vi.fn(),
  mockSessionBlockListAdd: vi.fn(),
}));

vi.mock('@/auth/providers/vidis-provider', () => ({
  getVidisJwks: mockGetVidisJwks,
}));

vi.mock('@/auth/session', () => ({
  sessionBlockList: { add: mockSessionBlockListAdd },
}));

vi.mock('@/env', () => ({
  env: {
    vidisClientId: 'chat-client',
    vidisIssuerUri: 'https://idp.example.com',
  },
}));

const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

const validClaims = (): JWTPayload => ({
  sid: 'session-123',
  iss: 'https://idp.example.com',
  aud: 'chat-client',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 120,
  jti: 'logout-token-123',
  events: { [BACKCHANNEL_LOGOUT_EVENT]: {} },
});

async function signToken(payload: JWTPayload) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  mockGetVidisJwks.mockResolvedValue(createLocalJWKSet({ keys: [await exportJWK(publicKey)] }));
  return new SignJWT(payload).setProtectedHeader({ alg: 'RS256' }).sign(privateKey);
}

const buildRequest = (logoutToken: string) =>
  new NextRequest('https://chat.example.com/api/auth/backchannel-logout', {
    method: 'POST',
    body: `logout_token=${encodeURIComponent(logoutToken)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

describe('POST /api/auth/backchannel-logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds the session to the block list for a validly signed logout_token', async () => {
    const logoutToken = await signToken(validClaims());

    const { POST } = await import('./route');
    const response = await POST(buildRequest(logoutToken));

    expect(response.status).toBe(200);
    expect(mockSessionBlockListAdd).toHaveBeenCalledWith('session-123');
  });

  it('rejects an unsigned (alg: none) logout_token', async () => {
    const { publicKey } = await generateKeyPair('RS256');
    const jwks = createLocalJWKSet({ keys: [await exportJWK(publicKey)] });
    mockGetVidisJwks.mockResolvedValue(jwks);

    const forgedToken = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
      JSON.stringify({ sid: 'session-123' }),
    ).toString('base64url')}.`;

    const { POST } = await import('./route');
    const response = await POST(buildRequest(forgedToken));

    expect(response.status).toBe(401);
    expect(mockSessionBlockListAdd).not.toHaveBeenCalled();
  });

  it('rejects a token signed by a different issuer', async () => {
    const logoutToken = await signToken({
      ...validClaims(),
      iss: 'https://attacker.example.com',
    });

    const { POST } = await import('./route');
    const response = await POST(buildRequest(logoutToken));

    expect(response.status).toBe(401);
    expect(mockSessionBlockListAdd).not.toHaveBeenCalled();
  });

  it('rejects a token issued for a different client', async () => {
    const logoutToken = await signToken({ ...validClaims(), aud: 'other-client' });

    const { POST } = await import('./route');
    const response = await POST(buildRequest(logoutToken));

    expect(response.status).toBe(401);
    expect(mockSessionBlockListAdd).not.toHaveBeenCalled();
  });

  it('rejects a stale token', async () => {
    const logoutToken = await signToken({
      ...validClaims(),
      iat: Math.floor(Date.now() / 1000) - 360,
    });

    const { POST } = await import('./route');
    const response = await POST(buildRequest(logoutToken));

    expect(response.status).toBe(401);
    expect(mockSessionBlockListAdd).not.toHaveBeenCalled();
  });

  it.each([
    ['the backchannel logout event', { events: undefined }],
    ['an issued-at time', { iat: undefined }],
    ['an expiration time', { exp: undefined }],
    ['a token ID', { jti: undefined }],
  ])('rejects a token without %s', async (_description, omittedClaim) => {
    const logoutToken = await signToken({ ...validClaims(), ...omittedClaim });

    const { POST } = await import('./route');
    const response = await POST(buildRequest(logoutToken));

    expect(response.status).toBe(401);
    expect(mockSessionBlockListAdd).not.toHaveBeenCalled();
  });

  it('rejects a token containing a nonce', async () => {
    const logoutToken = await signToken({ ...validClaims(), nonce: 'authentication-nonce' });

    const { POST } = await import('./route');
    const response = await POST(buildRequest(logoutToken));

    expect(response.status).toBe(401);
    expect(mockSessionBlockListAdd).not.toHaveBeenCalled();
  });
});
