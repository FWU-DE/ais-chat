import { test, expect } from '@playwright/test';
import { authorizationHeader, getEmbeddingModel } from '../utils/api.js';

test.describe('POST /v1/embeddings', () => {
  test('returns 401 without authentication', { tag: '@smoke' }, async ({ request }) => {
    const response = await request.post('/v1/embeddings', {
      data: {
        model: 'text-embedding-ada-002',
        input: ['Hello world'],
      },
    });

    expect(response.status()).toBe(401);
  });

  test('returns 400 for invalid request body', { tag: '@smoke' }, async ({ request }) => {
    const response = await request.post('/v1/embeddings', {
      headers: authorizationHeader,
      data: { invalid: 'body' },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('returns embedding vectors', async ({ request }) => {
    const embeddingModel = await getEmbeddingModel(request);

    const response = await request.post('/v1/embeddings', {
      headers: authorizationHeader,
      data: {
        model: embeddingModel.name,
        input: ['The quick brown fox jumps over the lazy dog'],
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // Each embedding should have a vector
    const embedding = body.data[0];
    expect(embedding).toHaveProperty('embedding');
    expect(Array.isArray(embedding.embedding)).toBe(true);
    expect(embedding.embedding.length).toBeGreaterThan(0);

    // Usage should be tracked
    expect(body).toHaveProperty('usage');
    expect(body.usage).toHaveProperty('prompt_tokens');
    expect(body.usage).toHaveProperty('total_tokens');
  });
});
