import { AiGenerationError, generateTextWithBilling } from '@ais-chat/ai-core';
import { dbGetFederalState } from '@shared/db/functions/federal-state';
import { getSpeechAuxiliaryModel } from '@shared/llm-models/auxiliary-model-service';

import { SpeechTextUsage } from '../types';
import { SSML_REWRITE_SYSTEM_PROMPT } from './prompt';

const SSML_REWRITE_TIMEOUT_MS = 30_000;

export type SsmlRewriteResult = {
  ssmlBody: string;
  usage: SpeechTextUsage;
};

function stripCodeFence(text: string): string {
  const match = /^```[a-z]*\n([\s\S]*?)\n?```$/i.exec(text.trim());
  return (match?.[1] ?? text).trim();
}

/**
 * Rewrites markdown text into an SSML body (the content of the `<voice>` element) using the speech
 * auxiliary model, so the speech service can read tables, formulas and code aloud naturally.
 * The usage is billed to the federal state's API key.
 */
export async function rewriteTextToSsml({
  text,
  federalStateId,
  abortSignal,
}: {
  text: string;
  federalStateId: string;
  abortSignal?: AbortSignal;
}): Promise<SsmlRewriteResult> {
  const [{ apiKeyId }, model] = await Promise.all([
    dbGetFederalState(federalStateId),
    getSpeechAuxiliaryModel(federalStateId),
  ]);
  if (!apiKeyId) {
    throw new AiGenerationError(`No API key configured for federal state ${federalStateId}`);
  }

  const timeoutSignal = AbortSignal.timeout(SSML_REWRITE_TIMEOUT_MS);
  const signal = abortSignal ? AbortSignal.any([abortSignal, timeoutSignal]) : timeoutSignal;

  try {
    const result = await generateTextWithBilling(
      model.id,
      [
        { role: 'system', content: SSML_REWRITE_SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      apiKeyId,
      { abortSignal: signal },
    );

    const ssmlBody = stripCodeFence(result.text);
    if (!ssmlBody) {
      throw new AiGenerationError('SSML rewrite returned an empty response');
    }

    return {
      ssmlBody,
      usage: {
        modelId: result.modelId,
        provider: result.provider,
        modelName: result.modelName,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        costsInCent: result.priceInCents,
      },
    };
  } catch (error) {
    if (timeoutSignal.aborted && !abortSignal?.aborted) {
      throw new AiGenerationError(`SSML rewrite timed out after ${SSML_REWRITE_TIMEOUT_MS} ms`);
    }
    throw error;
  }
}
