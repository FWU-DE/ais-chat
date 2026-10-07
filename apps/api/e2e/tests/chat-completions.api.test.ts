import { expect, test } from '@playwright/test';
import { authorizationHeader, getModel, getTextModel } from '../utils/api.js';

test.describe('POST /v1/chat/completions', () => {
  test.describe('Non-streaming', () => {
    test('returns 401 without authentication', { tag: '@smoke' }, async ({ request }) => {
      const response = await request.post('/v1/chat/completions', {
        data: {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: false,
        },
      });

      expect(response.status()).toBe(401);
    });

    test('returns 400 for invalid request body', { tag: '@smoke' }, async ({ request }) => {
      const response = await request.post('/v1/chat/completions', {
        headers: authorizationHeader,
        data: { invalid: 'body' },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    test('returns a chat completion response', { tag: '@smoke' }, async ({ request }) => {
      const textModel = await getModel(request, 'mock-echo-1');

      const response = await request.post('/v1/chat/completions', {
        headers: authorizationHeader,
        data: {
          model: textModel.name,
          messages: [{ role: 'user', content: 'Reply with exactly: hello' }],
          max_tokens: 200,
          temperature: 0.1,
          stream: false,
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('choices');
      expect(Array.isArray(body.choices)).toBe(true);
      expect(body.choices.length).toBeGreaterThan(0);
      expect(body.choices[0]).toHaveProperty('message');
      expect(body.choices[0].message).toHaveProperty('content');
      expect(typeof body.choices[0].message.content).toBe('string');
      expect(body.choices[0].message.content.length).toBeGreaterThan(0);

      // Usage should be present
      expect(body).toHaveProperty('usage');
      expect(body.usage).toHaveProperty('prompt_tokens');
      expect(body.usage).toHaveProperty('completion_tokens');
      expect(body.usage).toHaveProperty('total_tokens');
    });

    test('returns a successful response when sending temperature to gpt-5-mini', async ({
      request,
    }) => {
      const gpt5MiniModel = await getModel(request, 'gpt-5-mini');

      const response = await request.post('/v1/chat/completions', {
        headers: authorizationHeader,
        data: {
          model: gpt5MiniModel.name,
          messages: [{ role: 'user', content: 'Reply with exactly: hello' }],
          max_tokens: 200,
          temperature: 0.1,
          stream: false,
        },
      });

      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body).toHaveProperty('choices');
      expect(Array.isArray(body.choices)).toBe(true);
      expect(body.choices.length).toBeGreaterThan(0);
      expect(body.choices[0]).toHaveProperty('message');
      expect(body.choices[0].message).toHaveProperty('content');
    });

    test('returns a successful empty response for max_tokens: 0', async ({ request }) => {
      const textModel = await getTextModel(request);

      const response = await request.post('/v1/chat/completions', {
        headers: authorizationHeader,
        data: {
          model: textModel.name,
          messages: [{ role: 'user', content: 'Reply with exactly: hello' }],
          max_tokens: 0,
          temperature: 0.1,
          stream: false,
        },
      });

      expect(response.status()).toBe(200);
    });
  });

  test.describe('Streaming', () => {
    test('returns a streamed response', { tag: '@smoke' }, async ({ request }) => {
      const textModel = await getModel(request, 'mock-echo-1');

      const response = await request.post('/v1/chat/completions', {
        headers: authorizationHeader,
        data: {
          model: textModel.name,
          messages: [{ role: 'user', content: 'Reply with exactly: hello' }],
          max_tokens: 200,
          temperature: 0.1,
          stream: true,
        },
      });

      expect(response.status()).toBe(200);

      const responseBody = await response.text();

      // Streaming responses consist of "data: {...}\n" lines ending with [DONE]
      expect(responseBody).toContain('data:');
      expect(responseBody).toContain('[DONE]');

      // Parse individual SSE chunks
      const dataLines = responseBody
        .split('\n')
        .filter((line: string) => line.startsWith('data:'))
        .map((line: string) => line.replace('data: ', '').trim())
        .filter((line: string) => line !== '' && line !== '[DONE]');

      expect(dataLines.length).toBeGreaterThan(0);

      // Each chunk should be valid JSON with the expected structure
      for (const line of dataLines) {
        const chunk = JSON.parse(line);
        expect(chunk).toHaveProperty('id');
        expect(chunk).toHaveProperty('choices');
        expect(Array.isArray(chunk.choices)).toBe(true);
      }

      // At least one content chunk should have delta content
      const contentChunks = dataLines
        .map((line: string) => JSON.parse(line))
        .filter(
          (chunk: { choices: { delta: { content?: string } }[] }) =>
            chunk.choices?.[0]?.delta?.content,
        );
      expect(contentChunks.length).toBeGreaterThan(0);
    });

    test('returns a successful empty stream for max_tokens: 0', async ({ request }) => {
      const textModel = await getTextModel(request);

      const response = await request.post('/v1/chat/completions', {
        headers: authorizationHeader,
        data: {
          model: textModel.name,
          messages: [{ role: 'user', content: 'Reply with exactly: hello' }],
          max_tokens: 0,
          temperature: 0.1,
          stream: true,
        },
      });

      expect(response.status()).toBe(200);

      const responseBody = await response.text();

      expect(responseBody).toContain('[DONE]');
    });
  });
});
