import type { protos } from '@google-cloud/text-to-speech';
import { v1beta1 } from '@google-cloud/text-to-speech';
import { AiGenerationError, ProviderConfigurationError } from '../../errors';
import { createGoogleAuth } from '../../google-client';
import type { AiModel, SpeechUsage } from '../types';

/**
 * Selects the audio container/encoding `constructGoogleCloudTtsStreamingSpeechGenerationFn`
 * requests from Google Cloud Text-to-Speech:
 * - `'ogg_opus'`: Opus encoded audio wrapped in an Ogg container. Self-describing (sample rate and
 *   channel count travel with the stream), so it's playable as-is (e.g. in a browser `<audio>`
 *   element) without extra metadata.
 * - `'pcm'`: headerless raw 16-bit signed little-endian samples at 24 kHz mono, matching the shape
 *   of the Gemini TTS provider's output (see `PCM_STREAM_AUDIO_FORMAT` in `../types`, though this is
 *   a separate constant since it's produced by a different provider). Useful when the caller needs
 *   raw samples to process (e.g. resampling, mixing) rather than a container format.
 */
export type GoogleCloudTtsAudioEncoding = 'ogg_opus' | 'pcm';

export const OGG_OPUS_STREAM_AUDIO_FORMAT = {
  encoding: 'ogg_opus',
} as const;

/** Google Cloud Text-to-Speech streams PCM for Chirp 3: HD voices at 24 kHz mono. */
export const PCM_STREAM_AUDIO_FORMAT = {
  encoding: 'pcm_s16le',
  sampleRate: 24_000,
  channels: 1,
} as const;

export type GoogleCloudTtsAudioFormat =
  typeof OGG_OPUS_STREAM_AUDIO_FORMAT | typeof PCM_STREAM_AUDIO_FORMAT;

/**
 * Result of `constructGoogleCloudTtsStreamingSpeechGenerationFn`'s generation call. Mirrors the
 * shape of `SpeechStreamResult` from `../types` (chunks/usage/format), but isn't that exact type
 * since `format` here depends on the requested `audioFormat` rather than always being the shared
 * `AudioFormat` (which currently only describes the Gemini provider's raw PCM output).
 */
export type GoogleCloudTtsStreamResult = {
  chunks: AsyncGenerator<Buffer, void, unknown>;
  usage: Promise<SpeechUsage>;
  format: GoogleCloudTtsAudioFormat;
};

export type GoogleCloudTtsStreamingSpeechGenerationFn = (args: {
  text: string;
  voice: string;
  abortSignal: AbortSignal;
  audioFormat: GoogleCloudTtsAudioEncoding;
}) => Promise<GoogleCloudTtsStreamResult>;

const CHIRP3_HD_VOICE_NAME_PATTERN = /^(?<languageCode>.+)-Chirp3-HD-[^-]+$/;

/**
 * Derives the BCP-47 language code Chirp 3: HD voices require from their full voice name, e.g.
 * `"en-US-Chirp3-HD-Aoede"` -> `"en-US"`.
 */
function getChirp3HdLanguageCode(voice: string): string {
  const match = CHIRP3_HD_VOICE_NAME_PATTERN.exec(voice);
  const languageCode = match?.groups?.languageCode;
  if (!languageCode) {
    throw new ProviderConfigurationError(
      `Voice "${voice}" is not a valid Chirp 3: HD voice name (expected format "<languageCode>-Chirp3-HD-<name>")`,
    );
  }
  return languageCode;
}

/**
 * Streaming speech generation using Google Cloud Text-to-Speech's Chirp 3: HD voices, returning
 * either Ogg Opus or raw PCM audio depending on the `audioFormat` argument passed to the returned
 * function (see `GoogleCloudTtsAudioEncoding`).
 *
 * Cloud Text-to-Speech has no REST streaming endpoint: the REST `text:synthesize` call always
 * returns the complete audio in a single batch response. Progressive audio chunks are only
 * available through the bidirectional streaming gRPC method `StreamingSynthesize`, which is
 * itself only compatible with Chirp 3: HD voices. This is why this provider uses the
 * `@google-cloud/text-to-speech` gRPC client instead of the REST-based `@google/genai` client used
 * by the Gemini TTS provider in `./google.ts`. The gRPC stream is a Node `Duplex`, so from the
 * caller's perspective it behaves the same as the Gemini provider's `for await` stream, and its
 * output (`AsyncGenerator<Buffer>`) is just as suitable for piping into an HTTP response stream.
 *
 * Not wired into `generate.ts`/`generate-stream.ts` or any app/route yet — this is a standalone
 * implementation.
 */
export function constructGoogleCloudTtsStreamingSpeechGenerationFn(
  model: AiModel,
): GoogleCloudTtsStreamingSpeechGenerationFn {
  if (model.setting.provider !== 'google') {
    throw new ProviderConfigurationError('Invalid model configuration for Google');
  }

  const client = new v1beta1.TextToSpeechClient({ auth: createGoogleAuth(model) });

  return async function getGoogleCloudTtsSpeechStream({ text, voice, abortSignal, audioFormat }) {
    const languageCode = getChirp3HdLanguageCode(voice);

    const grpcStream = client.streamingSynthesize();

    // The RPC starts writing immediately below, but `readChunks()` below is an async generator:
    // its body (including the `for await` and its `catch`) only starts running once the caller
    // begins iterating `chunks`, which can be well after this point. Without this listener, an
    // error emitted by `grpcStream` before iteration starts would have no registered handler and
    // crash the process instead of surfacing as an `AiGenerationError`.
    let earlyError: Error | undefined;
    const captureEarlyError = (error: Error) => {
      earlyError = error;
    };
    grpcStream.on('error', captureEarlyError);

    const onAbort = () => grpcStream.cancel();
    abortSignal.addEventListener('abort', onAbort);

    const streamingAudioConfig: protos.google.cloud.texttospeech.v1beta1.IStreamingAudioConfig =
      audioFormat === 'pcm'
        ? { audioEncoding: 'PCM', sampleRateHertz: PCM_STREAM_AUDIO_FORMAT.sampleRate }
        : { audioEncoding: 'OGG_OPUS' };

    const streamingConfig: protos.google.cloud.texttospeech.v1beta1.IStreamingSynthesizeRequest = {
      streamingConfig: {
        voice: { languageCode, name: voice },
        streamingAudioConfig,
      },
    };
    const inputRequest: protos.google.cloud.texttospeech.v1beta1.IStreamingSynthesizeRequest = {
      input: { text },
    };

    grpcStream.write(streamingConfig);
    grpcStream.write(inputRequest);
    grpcStream.end();

    let resolveUsage: (usage: SpeechUsage) => void;
    const usage = new Promise<SpeechUsage>((resolve) => {
      resolveUsage = resolve;
    });

    async function* readChunks() {
      let receivedAudio = false;

      try {
        // Surface any error that arrived before iteration started (see `captureEarlyError`
        // above) instead of silently iterating a stream that has already ended in error.
        if (earlyError) {
          throw earlyError;
        }

        for await (const response of grpcStream as AsyncIterable<protos.google.cloud.texttospeech.v1beta1.IStreamingSynthesizeResponse>) {
          if (response.audioContent) {
            receivedAudio = true;
            yield Buffer.from(response.audioContent);
          }
        }
      } catch (error) {
        throw new AiGenerationError(
          `Google Cloud Text-to-Speech (stream) request failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        grpcStream.off('error', captureEarlyError);
        abortSignal.removeEventListener('abort', onAbort);
        resolveUsage({ inputTextTokens: text.length, outputAudioTokens: 0 });
      }

      if (!receivedAudio) {
        throw new AiGenerationError(
          'No audio data received from Google Cloud Text-to-Speech stream',
        );
      }
    }

    const format = audioFormat === 'pcm' ? PCM_STREAM_AUDIO_FORMAT : OGG_OPUS_STREAM_AUDIO_FORMAT;
    return { chunks: readChunks(), usage, format };
  };
}
