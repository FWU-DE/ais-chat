/** Shared LLM model configuration for e2e tests. */
export const LLM_MODELS = {
  TEXT_MODEL_1: process.env.E2E_TEXT_MODEL_1 ?? 'Mock LLM',
  TEXT_MODEL_2: process.env.E2E_TEXT_MODEL_2 ?? 'Mock LLM (2)',
  IMAGE_CAPABLE_MODEL: 'GPT-5 nano',
} as const;
