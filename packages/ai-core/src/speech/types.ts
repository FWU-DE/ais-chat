import type { LlmModel } from '@ais-chat/api-database';

export const MP3_MIME_TYPE = 'audio/mpeg';

export type SpeechMimeType = typeof MP3_MIME_TYPE;

export type SpeechUsage = {
  inputTextTokens: number;
  outputAudioTokens: number;
};

export type SpeechCosts = {
  costsInCent: number;
};

export type SpeechResponse = {
  audioBuffer: Buffer;
  mimeType: SpeechMimeType;
  usage: SpeechUsage;
};

export type SpeechGenerationFn = (args: {
  text: string;
  voice: string;
  abortSignal: AbortSignal;
}) => Promise<SpeechResponse>;

/**
 * Result of a streaming speech generation call. `chunks` yields MP3 buffers as they arrive.
 * `usage` only resolves once `chunks` has been fully consumed, since providers report token usage
 * after the last chunk.
 */
export type SpeechStreamResult = {
  chunks: AsyncGenerator<Buffer, void, unknown>;
  usage: Promise<SpeechUsage>;
  mimeType: SpeechMimeType;
};

export type SpeechStreamGenerationFn = (args: {
  text: string;
  voice: string;
  abortSignal: AbortSignal;
}) => Promise<SpeechStreamResult>;

export type AiModel = LlmModel;
