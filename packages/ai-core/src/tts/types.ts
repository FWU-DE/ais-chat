import type { LlmModel } from '@ais-chat/api-database';

export type SpeechResponse = {
  wavBuffer: Buffer;
};

export type SpeechGenerationFn = (args: { text: string; voice: string }) => Promise<SpeechResponse>;

export type AiModel = LlmModel;
