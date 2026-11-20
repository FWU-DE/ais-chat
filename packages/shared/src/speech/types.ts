import { SpeechMimeType } from '@ais-chat/ai-core';

export type ChatSpeechStreamResult = {
  chunks: AsyncGenerator<Buffer, void, unknown>;
  contentType: SpeechMimeType;
  costsInCent: Promise<number>;
  modelId: string;
  modelName: string;
  provider: string;
};
