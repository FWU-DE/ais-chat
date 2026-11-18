import OpenAI from 'openai';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.API_KEY = 'test-api-key';
  process.env.API_DATABASE_URL = 'postgres://test';

  return {
    dbValidateApiKey: vi.fn().mockResolvedValue({
      valid: true,
      apiKey: {
        id: '7fde5f9b-a687-6e6c-bf1e-ad5dcdf6e7f9',
        name: 'test key',
        keyId: 'test',
        secretHash: 'hash',
        projectId: '6ecd4f8a-9576-5d5b-af0d-fc4cbce5d6e8',
        state: 'active',
        limitInCent: 0,
        createdAt: new Date('2025-01-01'),
        expiresAt: null,
      },
    }),
    generateSpeechStreamByNameWithBilling: vi.fn(),
  };
});

vi.mock('@ais-chat/api-database', () => ({
  dbValidateApiKey: mocks.dbValidateApiKey,
  getCurrentUsageInCentByApiKeyIdWithResult: vi.fn(),
  dbGetProjectsWithApiKeys: vi.fn(),
  getUsageInCentByApiKeyId: vi.fn(),
}));

vi.mock('@ais-chat/api-database/utils', () => ({
  errorifyAsyncFn:
    <T extends (...args: never[]) => Promise<unknown>>(fn: T) =>
    async (...args: Parameters<T>) => {
      try {
        return [null, await fn(...args)] as const;
      } catch (error) {
        return [error instanceof Error ? error : new Error(String(error)), null] as const;
      }
    },
}));

vi.mock('@ais-chat/ai-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@ais-chat/ai-core')>();
  return {
    ...original,
    generateSpeechStreamByNameWithBilling: mocks.generateSpeechStreamByNameWithBilling,
  };
});

import {
  ApiKeyQuotaExceededError,
  ApiKeyUnusableError,
  InvalidModelError,
  InvalidSpeechVoiceError,
} from '@ais-chat/ai-core/errors';

import buildApp from '@/app';

const apiKey = 'sk_test_secret';
const chunks = [Buffer.from([0xff, 0xfb, 1, 2]), Buffer.from([3, 4])];

function speechStream() {
  return {
    chunks: (async function* () {
      await Promise.resolve();
      yield chunks[0];
      yield chunks[1];
    })(),
    mimeType: 'audio/mpeg',
    usage: Promise.resolve({ characters: 5 }),
    priceInCents: Promise.resolve(0.01),
    model: { name: 'tts' },
  };
}

describe('POST /v1/audio/speech', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let baseUrl: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected the test server to listen on a TCP address');
    }
    baseUrl = `http://127.0.0.1:${address.port}/v1`;
  });

  afterAll(async () => {
    app.server.closeAllConnections();
    await app.close();
  });

  beforeEach(() => {
    mocks.generateSpeechStreamByNameWithBilling.mockReset();
    mocks.generateSpeechStreamByNameWithBilling.mockReturnValue(speechStream());
  });

  function client() {
    return new OpenAI({ apiKey, baseURL: baseUrl, maxRetries: 0 });
  }

  it('returns concatenated audio through the OpenAI SDK', async () => {
    const response = await client().audio.speech.create({
      model: 'tts',
      voice: 'alloy',
      input: 'Hallo',
    });

    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.concat(chunks));
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(mocks.generateSpeechStreamByNameWithBilling).toHaveBeenCalledWith(
      'tts',
      'Hallo',
      'alloy',
      '7fde5f9b-a687-6e6c-bf1e-ad5dcdf6e7f9',
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    );
  });

  it('returns base64 delta SSE events and a done event', async () => {
    const response = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts', voice: 'alloy', input: 'Hallo', stream_format: 'sse' }),
    });
    const events = (await response.text())
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)) as { type: string; audio?: string });

    expect(events.map((event) => event.type)).toEqual([
      'speech.audio.delta',
      'speech.audio.delta',
      'speech.audio.done',
    ]);
    expect(Buffer.from(events[0]!.audio!, 'base64')).toEqual(chunks[0]);
    expect(Buffer.from(events[1]!.audio!, 'base64')).toEqual(chunks[1]);
  });

  it.each([
    [{ response_format: 'wav' as const }, 'unsupported response format'],
    [{ input: 'x'.repeat(4097) }, 'input length'],
    [{ speed: 1.5 }, 'speed'],
    [{ instructions: 'x' }, 'instructions'],
  ])('rejects %s with 400 (%s)', async (extra, description) => {
    void description;
    await expect(
      client().audio.speech.create({ model: 'tts', voice: 'alloy', input: 'Hallo', ...extra }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('reports a missing voice as a structured bad request', async () => {
    const response = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts', input: 'Hallo' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'Bad request',
      details: expect.any(String),
    });
  });

  it.each([
    [new InvalidModelError('unknown model'), 404],
    [new InvalidSpeechVoiceError('bad', ['alloy']), 400],
    [new ApiKeyQuotaExceededError('quota'), 429],
    [new ApiKeyUnusableError({ apiKeyId: 'key', reason: 'expired' }), 403],
    [new Error('provider failed'), 500],
  ])('maps %s to HTTP %s', async (error, status) => {
    mocks.generateSpeechStreamByNameWithBilling.mockRejectedValue(error);

    await expect(
      client().audio.speech.create({ model: 'tts', voice: 'alloy', input: 'Hallo' }),
    ).rejects.toMatchObject({ status });
  });

  it('rejects requests without authorization', async () => {
    const response = await fetch(`${baseUrl}/audio/speech`, { method: 'POST' });

    expect(response.status).toBe(401);
  });

  it('aborts the SDK response when the stream fails after its first chunk', async () => {
    mocks.generateSpeechStreamByNameWithBilling.mockReturnValue({
      ...speechStream(),
      chunks: (async function* () {
        await Promise.resolve();
        yield chunks[0];
        throw new Error('stream failed');
      })(),
    });

    try {
      const response = await fetch(`${baseUrl}/audio/speech`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts', voice: 'alloy', input: 'Hallo' }),
      });

      await expect(response.arrayBuffer()).rejects.toThrow();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('closes the connection when billing fails after streaming audio', async () => {
    const billingError = new Error('billing unavailable');
    mocks.generateSpeechStreamByNameWithBilling.mockReturnValue({
      ...speechStream(),
      chunks: (async function* () {
        await Promise.resolve();
        yield chunks[0];
        throw billingError;
      })(),
    });
    const logError = vi.spyOn(app.log, 'error');

    try {
      const response = await fetch(`${baseUrl}/audio/speech`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts', voice: 'alloy', input: 'Hallo' }),
      });

      await expect(response.arrayBuffer()).rejects.toThrow();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
    expect(logError).toHaveBeenCalledWith(billingError, 'Error processing speech stream');
    logError.mockRestore();
  });

  it('closes the generator when the client aborts', async () => {
    let release!: () => void;
    let finalized = false;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.generateSpeechStreamByNameWithBilling.mockReturnValue({
      ...speechStream(),
      chunks: (async function* () {
        try {
          yield chunks[0];
          await waiting;
          yield chunks[1];
        } finally {
          finalized = true;
        }
      })(),
    });

    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts', voice: 'alloy', input: 'Hallo' }),
      signal: controller.signal,
    });
    await response.body!.getReader().read();
    controller.abort();
    release();

    await vi.waitFor(() => {
      expect(finalized).toBe(true);
    });
  });

  it('closes a stream resolved after the client disconnects', async () => {
    let resolveStream!: (stream: ReturnType<typeof speechStream>) => void;
    let finalized = false;
    const streamPromise = new Promise<ReturnType<typeof speechStream>>((resolve) => {
      resolveStream = resolve;
    });
    const delayedStream = speechStream();
    delayedStream.chunks = (async function* () {
      try {
        await Promise.resolve();
        yield chunks[0];
      } finally {
        finalized = true;
      }
    })();
    mocks.generateSpeechStreamByNameWithBilling.mockReturnValueOnce(streamPromise);

    const controller = new AbortController();
    const request = fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts', voice: 'alloy', input: 'Hallo' }),
      signal: controller.signal,
    });
    await vi.waitFor(() => {
      expect(mocks.generateSpeechStreamByNameWithBilling).toHaveBeenCalled();
    });
    controller.abort();
    resolveStream(delayedStream);

    await expect(request).rejects.toBeInstanceOf(Error);
    await vi.waitFor(() => {
      expect(finalized).toBe(true);
    });
  });
});
