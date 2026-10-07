import { test, expect } from '@playwright/test';

test.describe('GET /health', { tag: '@smoke' }, () => {
  test('returns 200 OK without authentication', async ({ request }) => {
    const response = await request.get('/health');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('message', 'Ok');
  });
});
