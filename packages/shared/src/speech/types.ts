import { SpeechMimeType } from '@ais-chat/ai-core';

export type ChatSpeechStreamResult = {
  chunks: AsyncGenerator<Buffer, void, unknown>;
  contentType: SpeechMimeType;
  costsInCent: Promise<number>;
  modelId: string;
  modelName: string;
  provider: string;
};

/** Usage of a text model call made while preparing speech, e.g. the SSML rewrite. */
export type SpeechTextUsage = {
  modelId: string;
  provider: string;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  costsInCent: number;
};
