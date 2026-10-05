import { test, expect } from '@playwright/test';
import { authorizationHeader } from '../utils/api.js';

test.describe('GET /v1/models', { tag: '@smoke' }, () => {
  test('returns 401 without authentication', async ({ request }) => {
    const response = await request.get('/v1/models');

    expect(response.status()).toBe(401);
  });

  test('returns a list of models with valid auth', async ({ request }) => {
    const response = await request.get('/v1/models', {
      headers: authorizationHeader,
    });

    expect(response.status()).toBe(200);
    const models = await response.json();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);

    // Each model should have the expected shape
    const model = models[0];
    expect(model).toHaveProperty('id');
    expect(model).toHaveProperty('name');
    expect(model).toHaveProperty('provider');

    // Sensitive fields should be stripped
    expect(model).not.toHaveProperty('setting');
    expect(model).not.toHaveProperty('organizationId');
  });
});
