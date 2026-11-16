import { describe, expect, it } from 'vitest';

import type { ApiKeyModel } from '../schema';
import { checkApiKeyUsable } from './api-key-validation';

const baseKey = {
  id: 'key-1',
  state: 'active',
  expiresAt: null,
} as unknown as ApiKeyModel;

const HOUR = 60 * 60 * 1000;

describe('checkApiKeyUsable', () => {
  it('rejects a missing key', () => {
    expect(checkApiKeyUsable(undefined)).toEqual({
      valid: false,
      reason: 'Could not find the api key',
    });
  });

  it('accepts an active key without expiry', () => {
    expect(checkApiKeyUsable(baseKey)).toEqual({ valid: true, apiKey: baseKey });
  });

  it('accepts a key with a future expiry', () => {
    const apiKey = { ...baseKey, expiresAt: new Date(Date.now() + HOUR) };
    expect(checkApiKeyUsable(apiKey).valid).toBe(true);
  });

  it('rejects an expired key', () => {
    const apiKey = { ...baseKey, expiresAt: new Date(Date.now() - HOUR) };
    expect(checkApiKeyUsable(apiKey)).toEqual({ valid: false, reason: 'Api key is expired' });
  });

  it('rejects an inactive key', () => {
    const apiKey = { ...baseKey, state: 'inactive' } as ApiKeyModel;
    expect(checkApiKeyUsable(apiKey)).toEqual({ valid: false, reason: 'Api key is inactive' });
  });

  it('rejects a deleted key', () => {
    const apiKey = { ...baseKey, state: 'deleted' } as ApiKeyModel;
    expect(checkApiKeyUsable(apiKey)).toEqual({ valid: false, reason: 'Api key was deleted' });
  });

  it('reports expired before inactive', () => {
    const apiKey = {
      ...baseKey,
      state: 'inactive',
      expiresAt: new Date(Date.now() - HOUR),
    } as ApiKeyModel;
    expect(checkApiKeyUsable(apiKey)).toEqual({ valid: false, reason: 'Api key is expired' });
  });
});
