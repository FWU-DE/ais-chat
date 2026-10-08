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

export type AiModel = LlmModel;
