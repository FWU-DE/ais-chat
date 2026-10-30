import { isLlmProvider } from '@ais-chat/api-database/llm-model';
import type { protos } from '@google-cloud/text-to-speech';
import { v1 } from '@google-cloud/text-to-speech';
import { AiGenerationError, ProviderConfigurationError } from '../../errors';
import {
  createGoogleAuth,
  getCredentialsFingerprint,
  getGoogleTextToSpeechServiceAddress,
} from '../../google-client';
import {
  PCM_STREAM_AUDIO_FORMAT,
  type AiModel,
  type SpeechStreamGenerationFn,
  type SpeechUsage,
} from '../types';

// We only support German voices at the moment
const LANGUAGE_CODE = 'de-DE';

// Todo: google cloud tts does not return token usage information
const NO_USAGE: SpeechUsage = { inputTextTokens: 0, outputAudioTokens: 0 };

// Cancellations and the `streamSpeechById` timeout arrive on the same signal, but only a
// cancellation should end the stream quietly.
function isTimeoutAbort(signal: AbortSignal): boolean {
  const reason: unknown = signal.reason;
  return reason instanceof Error && reason.name === 'TimeoutError';
}

async function* readNothing(): AsyncGenerator<Buffer, void, unknown> {
  yield* [];
}

// Each client owns a gRPC channel, so they are reused across requests instead of re-running the
// TCP/TLS/HTTP2 handshake per synthesis. Never closed: they live for the process lifetime.
const clientCache = new Map<string, v1.TextToSpeechClient>();

function getClient(model: AiModel) {
  if (!isLlmProvider(model.setting, 'google')) {
    throw new ProviderConfigurationError('Invalid model configuration for Google');
  }

  const { projectId, location, authCredentials } = model.setting;
  const cacheKey = `${projectId}-${location}-${getCredentialsFingerprint(authCredentials)}`;

  const cachedClient = clientCache.get(cacheKey);
  if (cachedClient) {
    return cachedClient;
  }

  const client = new v1.TextToSpeechClient({
    auth: createGoogleAuth(model),
    apiEndpoint: getGoogleTextToSpeechServiceAddress(location),
    projectId,
    // Mirrors the `x-goog-user-project` header the regional endpoints expect for quota/billing.
    quotaProjectId: projectId,
  });
  clientCache.set(cacheKey, client);

  return client;
}

export function constructGoogleCloudTtsStreamingSpeechGenerationFn(
  model: AiModel,
): SpeechStreamGenerationFn {
  const client = getClient(model);

  return async function getGoogleCloudTtsSpeechStream({ text, voice, abortSignal }) {
    // `AbortSignal` only fires the `abort` event at the moment `.abort()` is called, so a listener
    // added after that (the `addEventListener` call below) would never run if the signal was
    // already aborted when we got here. Bail out before creating the gRPC stream/sending any text
    // so an already-cancelled caller doesn't still trigger synthesis.
    if (abortSignal.aborted) {
      if (isTimeoutAbort(abortSignal)) {
        throw new AiGenerationError('Google Cloud Text-to-Speech (stream) request timed out');
      }

      return {
        chunks: readNothing(),
        usage: Promise.resolve(NO_USAGE),
        format: PCM_STREAM_AUDIO_FORMAT,
      };
    }

    const grpcStream = client.streamingSynthesize();

    let resolveUsage: (usage: SpeechUsage) => void;
    const usage = new Promise<SpeechUsage>((resolve) => {
      resolveUsage = resolve;
    });

    // The RPC starts writing immediately below, but `readChunks()` below is an async generator:
    // its body (including the `for await` and its `catch`) only starts running once the caller
    // begins iterating `chunks`, which can be well after this point. Without this listener, an
    // error emitted by `grpcStream` before iteration starts would have no registered handler and
    // crash the process instead of surfacing as an `AiGenerationError`.
    let earlyError: Error | undefined;
    const captureEarlyError = (error: Error) => {
      earlyError = error;
    };
    const onAbort = () => grpcStream.cancel();

    let released = false;
    // Also hooked to `close` so a caller that never iterates `chunks` (e.g. the pipeline threw
    // before consuming them) doesn't leak the abort listener or leave `usage` pending forever.
    const release = () => {
      if (released) return;
      released = true;
      grpcStream.off('error', captureEarlyError);
      abortSignal.removeEventListener('abort', onAbort);
      resolveUsage(NO_USAGE);
    };

    grpcStream.on('error', captureEarlyError);
    grpcStream.once('close', release);
    abortSignal.addEventListener('abort', onAbort, { once: true });

    const streamingAudioConfig: protos.google.cloud.texttospeech.v1.IStreamingAudioConfig = {
      audioEncoding: 'PCM',
      sampleRateHertz: PCM_STREAM_AUDIO_FORMAT.sampleRate,
    };

    const streamingConfig: protos.google.cloud.texttospeech.v1.IStreamingSynthesizeRequest = {
      streamingConfig: {
        voice: { languageCode: LANGUAGE_CODE, name: voice },
        streamingAudioConfig,
      },
    };
    const inputRequest: protos.google.cloud.texttospeech.v1.IStreamingSynthesizeRequest = {
      input: { text },
    };

    grpcStream.write(streamingConfig);
    grpcStream.write(inputRequest);
    grpcStream.end();

    async function* readChunks() {
      let receivedAudio = false;

      try {
        // Surface any error that arrived before iteration started (see `captureEarlyError`
        // above) instead of silently iterating a stream that has already ended in error.
        if (earlyError) {
          throw earlyError;
        }

        for await (const response of grpcStream as AsyncIterable<protos.google.cloud.texttospeech.v1.IStreamingSynthesizeResponse>) {
          if (response.audioContent) {
            receivedAudio = true;
            yield Buffer.from(response.audioContent);
          }
        }
      } catch (error) {
        // Cancelling mid-playback is a normal user action, so end the stream instead of raising
        // an error the caller would log and report.
        if (abortSignal.aborted && !isTimeoutAbort(abortSignal)) {
          return;
        }

        throw new AiGenerationError(
          `Google Cloud Text-to-Speech (stream) request failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        release();
      }

      if (!receivedAudio && !abortSignal.aborted) {
        throw new AiGenerationError(
          'No audio data received from Google Cloud Text-to-Speech stream',
        );
      }
    }

    return { chunks: readChunks(), usage, format: PCM_STREAM_AUDIO_FORMAT };
  };
}
