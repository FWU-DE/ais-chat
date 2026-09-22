import type { LlmModel } from '@ais-chat/api-database';

export type SpeechResponse = {
  wavBuffer: Buffer;
};

export type SpeechGenerationFn = (args: { text: string; voice: string }) => Promise<SpeechResponse>;

// TODO: Rename this when the llmModel table is renamed (it has image, embedding, and speech models too).
export type AiModel = LlmModel;
