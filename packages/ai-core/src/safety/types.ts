import type { LlmModel } from '@ais-chat/api-database';

export type SafetyResult = {
  result: string;
};

export type SafetyCheckFn = (args: { text: string; model: string }) => Promise<SafetyResult>;

export type AiModel = LlmModel;
