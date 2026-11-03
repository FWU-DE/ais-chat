/** Shared LLM model configuration for e2e tests. */
export const LLM_MODELS = {
  TEXT_MODEL_1: process.env.E2E_TEXT_MODEL_1 ?? 'GPT-5 nano',
  TEXT_MODEL_2: process.env.E2E_TEXT_MODEL_2 ?? 'GPT-5 mini',
  REAL_MODEL: process.env.E2E_REAL_MODEL ?? 'GPT-5 nano',
} as const;
