import { v1beta1 } from '@google-cloud/text-to-speech';
import type { protos } from '@google-cloud/text-to-speech';
import { AiGenerationError, ProviderConfigurationError } from '../../errors';
import { createGoogleAuth } from '../../google-client';
import type { AiModel, SpeechUsage } from '../types';

/**
 * Format of the Ogg-container Opus chunks yielded by `constructGoogleCloudTtsStreamingSpeechGenerationFn`.
 * Unlike the headerless raw PCM produced by the Gemini TTS provider (see `PCM_STREAM_AUDIO_FORMAT`),
 * Ogg Opus is self-describing (sample rate and channel count are carried in the stream itself), so
 * no extra metadata is needed for a consumer (e.g. a browser `<audio>` element or an Opus decoder) to
 * play it back.
 */
export const OGG_OPUS_STREAM_AUDIO_FORMAT = {
  encoding: 'ogg_opus',
} as const;

export type GoogleCloudTtsAudioFormat = typeof OGG_OPUS_STREAM_AUDIO_FORMAT;

/**
 * Result of `constructGoogleCloudTtsStreamingSpeechGenerationFn`'s generation call. Mirrors the
 * shape of `SpeechStreamResult` from `../types` (chunks/usage/format), but isn't that exact type
 * since `format` here is Ogg Opus rather than the shared `AudioFormat` (which currently only
 * describes the Gemini provider's raw PCM output).
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
 * Ogg Opus audio.
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

  return async function getGoogleCloudTtsSpeechStream({ text, voice, abortSignal }) {
    const languageCode = getChirp3HdLanguageCode(voice);

    const grpcStream = client.streamingSynthesize();

    const onAbort = () => grpcStream.cancel();
    abortSignal.addEventListener('abort', onAbort);

    const streamingConfig: protos.google.cloud.texttospeech.v1beta1.IStreamingSynthesizeRequest = {
      streamingConfig: {
        voice: { languageCode, name: voice },
        streamingAudioConfig: { audioEncoding: 'OGG_OPUS' },
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
        abortSignal.removeEventListener('abort', onAbort);
        resolveUsage({ inputTextTokens: text.length, outputAudioTokens: 0 });
      }

      if (!receivedAudio) {
        throw new AiGenerationError(
          'No audio data received from Google Cloud Text-to-Speech stream',
        );
      }
    }

    return { chunks: readChunks(), usage, format: OGG_OPUS_STREAM_AUDIO_FORMAT };
  };
}
