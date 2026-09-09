import type { LlmModel } from '@ais-chat/api-database';

export type SafetyResult =
  | { safe: true }
  | {
      safe: false;
      categories: string[];
    };

export type SafetyImage = {
  type: 'image';
  contentType: string;
  url: string;
};

export type SafetyMessage = {
  role: 'user' | 'assistant';
  content: string;
  images?: SafetyImage[];
};

export type SafetyCheckArgs = {
  model: string;
  messages: SafetyMessage[];
};

export type SafetyCheckFn = (args: SafetyCheckArgs) => Promise<SafetyResult>;

export type AiModel = LlmModel;
