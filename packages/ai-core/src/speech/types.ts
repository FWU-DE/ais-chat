import type { LlmModel } from '@ais-chat/api-database';

/**
 * Format of the raw PCM chunks yielded by streaming speech generation. `Content-Type` on the raw
 * stream is `application/octet-stream` (there's no standard MIME type for little-endian L16), so
 * these values are surfaced via `SpeechStreamResult.format` instead, letting callers (e.g. a
 * future PCM/Opus converter) know what they're consuming without hardcoding assumptions.
 */
export const PCM_STREAM_AUDIO_FORMAT = {
  encoding: 'pcm_s16le',
  sampleRate: 24_000,
  channels: 1,
} as const;

export type AudioFormat = typeof PCM_STREAM_AUDIO_FORMAT;

export type SpeechUsage = {
  inputTextTokens: number;
  outputAudioTokens: number;
};

export type SpeechCosts = {
  costsInCent: number;
};

export type SpeechResponse = {
  wavBuffer: Buffer;
  usage: SpeechUsage;
};

export type SpeechGenerationFn = (args: {
  text: string;
  voice: string;
  abortSignal: AbortSignal;
}) => Promise<SpeechResponse>;

/**
 * Result of a streaming speech generation call. `chunks` yields raw PCM buffers in `format` as
 * they arrive. `usage` only resolves once `chunks` has been fully consumed, since providers report
 * token usage after the last chunk.
 */
export type SpeechStreamResult = {
  chunks: AsyncGenerator<Buffer, void, unknown>;
  usage: Promise<SpeechUsage | SpeechCosts>;
  format: AudioFormat;
};

export type SpeechStreamGenerationFn = (args: {
  text: string;
  voice: string;
  abortSignal: AbortSignal;
}) => Promise<SpeechStreamResult>;

export type AiModel = LlmModel;
