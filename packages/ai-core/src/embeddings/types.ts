import type { SensitiveLlmModel } from '@ais-chat/api-database';

export type EmbeddingUsage = {
  promptTokens: number;
  totalTokens: number;
};

export type EmbeddingResponse = {
  embeddings: number[][];
  usage?: EmbeddingUsage;
};

export type EmbeddingGenerationFn = (args: {
  texts: string[];
  model: string;
}) => Promise<EmbeddingResponse>;

// TODO: Rename this when the llmModel table is renamed (it has image and embedding models too)
export type AiModel = SensitiveLlmModel;
