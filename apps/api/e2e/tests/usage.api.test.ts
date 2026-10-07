import { test, expect } from '@playwright/test';
import { authorizationHeader } from '../utils/api.js';

test.describe('GET /v1/usage', { tag: '@smoke' }, () => {
  test('returns 401 without authentication', async ({ request }) => {
    const response = await request.get('/v1/usage');

    expect(response.status()).toBe(401);
  });

  test('returns usage data with valid auth', async ({ request }) => {
    const response = await request.get('/v1/usage', {
      headers: authorizationHeader,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('remainingLimitInCent');
    expect(body).toHaveProperty('limitInCent');

    expect(typeof body.remainingLimitInCent).toBe('number');
    expect(typeof body.limitInCent).toBe('number');
    expect(body.remainingLimitInCent).toBeGreaterThanOrEqual(0);
    expect(body.limitInCent).toBeGreaterThan(0);
  });
});
