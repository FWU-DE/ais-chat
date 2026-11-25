import { expect, test } from '@playwright/test';

import { authorizationHeader, getModel, getSpeechModel } from '../utils/api.js';
import { withIsolatedSpeechApiKey } from '../utils/speech-usage.js';

const mockSpeechRequest = {
  model: 'mock-speech',
  input: 'Hello from the speech API',
  voice: 'alloy',
};

type SpeechModel = {
  name: string;
  provider?: string;
  priceMetadata?: {
    type?: string;
    priceInCentPer1MillionCharacters?: number;
  };
  modelConfig?: {
    voices?: Array<{ name: string; displayName?: string }>;
  };
};

async function getConfiguredSpeechModel(request: Parameters<typeof getSpeechModel>[0]) {
  // E2E_SPEECH_MODEL (optionally E2E_SPEECH_VOICE) overrides the seeded Bifrost mock speech model.
  const configuredModelName = process.env['E2E_SPEECH_MODEL'];

  if (configuredModelName) {
    return getModel(request, configuredModelName);
  }

  const response = await request.get('/v1/models', { headers: authorizationHeader });
  const models = (await response.json()) as SpeechModel[];

  // Speech generation currently only supports Bifrost; other providers cannot synthesize audio.
  return models.find(
    (model) => model.priceMetadata?.type === 'speech' && model.provider === 'bifrost',
  );
}

async function getSpeechRequest(request: Parameters<typeof getSpeechModel>[0]) {
  const model = await getConfiguredSpeechModel(request);

  if (!model) {
    return undefined;
  }

  const voices = model.modelConfig?.voices;
  const voice = process.env['E2E_SPEECH_VOICE'] ?? voices?.[0]?.name;

  if (!voice) {
    return undefined;
  }

  return {
    model: model.name,
    input: 'Hello from the speech API',
    voice,
  };
}

test.describe('POST /v1/audio/speech', () => {
  test('returns 401 without authentication', { tag: '@smoke' }, async ({ request }) => {
    const response = await request.post('/v1/audio/speech', {
      data: mockSpeechRequest,
    });

    expect(response.status()).toBe(401);
    expect(await response.json()).toHaveProperty('error');
  });

  test('returns 400 when input is missing', { tag: '@smoke' }, async ({ request }) => {
    const response = await request.post('/v1/audio/speech', {
      headers: authorizationHeader,
      data: { model: 'mock-speech', voice: 'alloy' },
    });

    expect(response.status()).toBe(400);
    expect(await response.json()).toHaveProperty('error', 'Bad request');
  });

  test('returns 404 for an unknown model', { tag: '@smoke' }, async ({ request }) => {
    const response = await request.post('/v1/audio/speech', {
      headers: authorizationHeader,
      data: { ...mockSpeechRequest, model: 'does-not-exist' },
    });

    expect(response.status()).toBe(404);
    expect(await response.json()).toHaveProperty('error');
  });

  test(
    'returns 400 for an unknown voice on the seeded speech model',
    { tag: '@smoke' },
    async ({ request }) => {
      let speechModel;

      try {
        speechModel = await getModel(request, 'mock-speech');
      } catch {
        test.skip(true, 'The seeded mock-speech model is not available');
        return;
      }

      const response = await request.post('/v1/audio/speech', {
        headers: authorizationHeader,
        data: { ...mockSpeechRequest, model: speechModel.name, voice: 'does-not-exist' },
      });

      expect(response.status()).toBe(400);
      expect(await response.json()).toHaveProperty('error');
    },
  );
});

test.describe('GET /v1/models speech metadata', () => {
  test(
    'exposes voices without sensitive speech settings',
    { tag: '@smoke' },
    async ({ request }) => {
      let speechModel;

      try {
        speechModel = await getSpeechModel(request);
      } catch {
        test.skip(true, 'No speech model is available');
        return;
      }

      expect(speechModel.modelConfig?.voices?.length).toBeGreaterThan(0);
      expect(speechModel).not.toHaveProperty('setting');
      expect(speechModel).not.toHaveProperty('useAzureSpeechEndpoint');
    },
  );
});

test.describe('speech model success responses', () => {
  test('returns chunked MP3 audio', { tag: '@smoke' }, async ({ request }) => {
    const speechRequest = await getSpeechRequest(request);

    test.skip(!speechRequest, 'No configured Bifrost speech model with a voice is available');

    const response = await request.post('/v1/audio/speech', {
      headers: authorizationHeader,
      data: speechRequest,
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('audio/mpeg');

    const audio = await response.body();
    expect(audio.length).toBeGreaterThan(1000);
    expect(
      (audio[0] === 0xff && (audio[1]! & 0xe0) === 0xe0) ||
        audio.subarray(0, 3).toString() === 'ID3',
    ).toBe(true);
  });

  test('streams audio and a completion event as SSE', { tag: '@smoke' }, async ({ request }) => {
    const speechRequest = await getSpeechRequest(request);

    test.skip(!speechRequest, 'No configured Bifrost speech model with a voice is available');

    const response = await request.post('/v1/audio/speech', {
      headers: authorizationHeader,
      data: { ...speechRequest, stream_format: 'sse' },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/event-stream');

    const events = (await response.text())
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice('data: '.length)) as { type: string; audio?: string });
    const deltas = events.filter((event) => event.type === 'speech.audio.delta');

    expect(deltas.length).toBeGreaterThan(0);
    for (const delta of deltas) {
      expect(delta.audio).toBeTruthy();
      expect(Buffer.from(delta.audio!, 'base64').length).toBeGreaterThan(0);
    }
    expect(events.at(-1)?.type).toBe('speech.audio.done');
  });

  test('records audio usage for the requesting API key', { tag: '@smoke' }, async ({ request }) => {
    const speechRequest = await getSpeechRequest(request);

    test.skip(!speechRequest, 'No configured Bifrost speech model with a voice is available');

    await withIsolatedSpeechApiKey(
      speechRequest!.model,
      async ({ apiKeyId, modelId, headers, getUsage }) => {
        expect(await getUsage()).toEqual([]);

        const audioResponse = await request.post('/v1/audio/speech', {
          headers,
          data: speechRequest,
        });
        expect(audioResponse.status()).toBe(200);

        // Exact price calculation is unit tested; this checks persistence and key attribution.
        expect(await getUsage()).toEqual([
          { apiKeyId, modelId, completionTokens: 0, promptTokens: 0, totalTokens: 0 },
        ]);
      },
    );
  });
});
