import type { LlmModel } from '@ais-chat/api-database';

export type SpeechUsage = {
  inputTextTokens: number;
  outputAudioTokens: number;
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
 * Result of a streaming speech generation call. `chunks` yields raw PCM (16-bit signed
 * little-endian, 24 kHz, mono) buffers as they arrive. `usage` only resolves once `chunks` has
 * been fully consumed, since providers report token usage after the last chunk.
 */
export type SpeechStreamResult = {
  chunks: AsyncGenerator<Buffer, void, unknown>;
  usage: Promise<SpeechUsage>;
};

export type SpeechStreamGenerationFn = (args: {
  text: string;
  voice: string;
  abortSignal: AbortSignal;
}) => Promise<SpeechStreamResult>;

export type AiModel = LlmModel;
