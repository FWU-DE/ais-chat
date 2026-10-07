import { test, expect } from '@playwright/test';
import { authorizationHeader, getImageModel } from '../utils/api.js';

test.describe('POST /v1/images/generations', () => {
  test('returns 401 without authentication', { tag: '@smoke' }, async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      data: {
        model: 'dall-e-3',
        prompt: 'A red circle',
      },
    });

    expect(response.status()).toBe(401);
  });

  test('returns 400 for invalid request body', { tag: '@smoke' }, async ({ request }) => {
    const response = await request.post('/v1/images/generations', {
      headers: authorizationHeader,
      data: { invalid: 'body' },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('generates an image from a prompt', async ({ request }) => {
    const imageModel = await getImageModel(request);

    const response = await request.post('/v1/images/generations', {
      headers: authorizationHeader,
      data: {
        model: imageModel.name,
        prompt: 'A simple red circle on a white background',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty('created');
    expect(typeof body.created).toBe('number');
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // Image data should be present as base64
    const imageData = body.data[0];
    expect(imageData).toHaveProperty('b64_json');
    expect(typeof imageData.b64_json).toBe('string');
    expect(imageData.b64_json.length).toBeGreaterThan(100);
  });
});
