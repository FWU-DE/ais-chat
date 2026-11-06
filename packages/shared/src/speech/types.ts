import { SpeechMimeType } from '@ais-chat/ai-core';

export const TOKEN_AMOUNT_PER_PRICE = 1_000_000;

export type ChatSpeechStreamResult = {
  chunks: AsyncGenerator<Buffer, void, unknown>;
  contentType: SpeechMimeType;
  costsInCent: Promise<number>;
  modelId: string;
  modelName: string;
  provider: string;
};
