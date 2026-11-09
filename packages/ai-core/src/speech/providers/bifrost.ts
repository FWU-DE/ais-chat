import { instrumentOpenAiClient } from '@sentry/server-utils';
import OpenAI from 'openai';
import { z } from 'zod';

import { env } from '../../env';
import { AiGenerationError, ProviderConfigurationError } from '../../errors';
import {
  type AiModel,
  MP3_MIME_TYPE,
  PCM_STREAM_AUDIO_FORMAT,
  type SpeechGenerationFn,
  type SpeechStreamGenerationFn,
  type SpeechUsage,
} from '../types';

/**
 * Azure AI Speech synthesizes 24 kHz 16-bit mono PCM for `response_format: 'pcm'`, which is
 * exactly `PCM_STREAM_AUDIO_FORMAT`, so streamed chunks need no conversion downstream.
 */
const STREAM_RESPONSE_FORMAT = 'pcm';
const NON_STREAM_RESPONSE_FORMAT = 'mp3';

function createBifrostClient(model: AiModel): { client: OpenAI; modelName: string } {
  if (model.provider !== 'bifrost') {
    throw new ProviderConfigurationError('Invalid model configuration for Bifrost');
  }

  if (!env.bifrostBaseUrl) {
    throw new ProviderConfigurationError('BIFROST_BASE_URL is not configured');
  }

  return {
    client: instrumentOpenAiClient(
      new OpenAI({
        apiKey: env.bifrostApiKey ?? 'not-needed',
        baseURL: env.bifrostBaseUrl,
        ...(env.bifrostApiKey ? { defaultHeaders: { 'x-bf-vk': env.bifrostApiKey } } : {}),
      }),
    ),
    modelName: model.name,
  };
}

const speechUsageSchema = z.object({
  input_tokens: z.number().nullish(),
  output_tokens: z.number().nullish(),
  /** Azure AI Speech bills characters rather than tokens. */
  input_chars: z.number().nullish(),
});

const speechEventSchema = z.object({
  type: z.string().nullish(),
  /** Base64-encoded audio in the requested `response_format`. */
  audio: z.string().nullish(),
  usage: speechUsageSchema.nullish(),
});

type BifrostSpeechUsage = z.infer<typeof speechUsageSchema>;
type BifrostSpeechEvent = z.infer<typeof speechEventSchema>;

function toSpeechUsage(usage: BifrostSpeechUsage | null | undefined): SpeechUsage {
  return {
    inputTextTokens: usage?.input_tokens ?? usage?.input_chars ?? 0,
    outputAudioTokens: usage?.output_tokens ?? 0,
  };
}

function parseSpeechEvent(line: string): BifrostSpeechEvent | undefined {
  if (!line.startsWith('data:')) return undefined;

  const payload = line.slice('data:'.length).trim();
  if (payload === '' || payload === '[DONE]') return undefined;

  try {
    return speechEventSchema.parse(JSON.parse(payload));
  } catch {
    throw new AiGenerationError('Received a malformed event from the Bifrost speech stream');
  }
}

/**
 * Bifrost answers `stream_format: 'sse'` with OpenAI's speech event stream: a series of
 * `speech.audio.delta` events carrying base64 audio, followed by a `speech.audio.done` event
 * carrying the usage. Usage is only known once the stream ends, so it's returned separately.
 */
async function* readSpeechEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffered += decoder.decode(value, { stream: true });

      let newlineIndex = buffered.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffered.slice(0, newlineIndex).trimEnd();
        buffered = buffered.slice(newlineIndex + 1);
        const event = parseSpeechEvent(line);
        if (event) yield event;
        newlineIndex = buffered.indexOf('\n');
      }
    }

    const trailing = parseSpeechEvent(buffered.trim());
    if (trailing) yield trailing;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function requestSpeechStream({
  client,
  modelName,
  text,
  voice,
  responseFormat,
  abortSignal,
}: {
  client: OpenAI;
  modelName: string;
  text: string;
  voice: string;
  responseFormat: typeof STREAM_RESPONSE_FORMAT | typeof NON_STREAM_RESPONSE_FORMAT;
  abortSignal: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  let response: Response;
  try {
    response = await client.audio.speech.create(
      {
        model: modelName,
        voice,
        input: text,
        response_format: responseFormat,
        stream_format: 'sse',
      },
      { signal: abortSignal },
    );
  } catch (error) {
    throw new AiGenerationError(
      `Bifrost Speech request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.body) {
    throw new AiGenerationError('No audio stream received from Bifrost Speech');
  }

  return response.body;
}

export function constructBifrostSpeechGenerationFn(model: AiModel): SpeechGenerationFn {
  const { client, modelName } = createBifrostClient(model);

  return async function getBifrostSpeech({ text, voice, abortSignal }) {
    const body = await requestSpeechStream({
      client,
      modelName,
      text,
      voice,
      responseFormat: NON_STREAM_RESPONSE_FORMAT,
      abortSignal,
    });

    const parts: Buffer[] = [];
    let usage: SpeechUsage = { inputTextTokens: 0, outputAudioTokens: 0 };

    for await (const event of readSpeechEvents(body)) {
      if (event.audio) parts.push(Buffer.from(event.audio, 'base64'));
      if (event.usage) usage = toSpeechUsage(event.usage);
    }

    if (parts.length === 0) {
      throw new AiGenerationError('No audio data received from Bifrost Speech');
    }

    // MP3 is a sequence of self-contained frames, so concatenating the deltas yields a valid file.
    return { audioBuffer: Buffer.concat(parts), mimeType: MP3_MIME_TYPE, usage };
  };
}

export function constructBifrostStreamingSpeechGenerationFn(
  model: AiModel,
): SpeechStreamGenerationFn {
  const { client, modelName } = createBifrostClient(model);

  return async function getBifrostSpeechStream({ text, voice, abortSignal }) {
    const body = await requestSpeechStream({
      client,
      modelName,
      text,
      voice,
      responseFormat: STREAM_RESPONSE_FORMAT,
      abortSignal,
    });

    let resolveUsage: (usage: SpeechUsage) => void;
    const usage = new Promise<SpeechUsage>((resolve) => {
      resolveUsage = resolve;
    });

    async function* readChunks() {
      let finalUsage: SpeechUsage = { inputTextTokens: 0, outputAudioTokens: 0 };
      let receivedAudio = false;

      try {
        for await (const event of readSpeechEvents(body)) {
          // Update usage first so a cancellation during the yield doesn't lose this event's usage.
          if (event.usage) finalUsage = toSpeechUsage(event.usage);

          if (event.audio) {
            receivedAudio = true;
            yield Buffer.from(event.audio, 'base64');
          }
        }
      } finally {
        resolveUsage(finalUsage);
      }

      if (!receivedAudio) {
        throw new AiGenerationError('No audio data received from Bifrost Speech stream');
      }
    }

    return { chunks: readChunks(), usage, format: PCM_STREAM_AUDIO_FORMAT };
  };
}
