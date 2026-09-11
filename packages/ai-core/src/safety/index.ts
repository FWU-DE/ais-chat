import { isKnownAiGenerationError, ResponsibleAIError } from '../errors';
import { getSafetyModelByName } from '../models';
import { checkSafety } from './providers';
import type { SafetyMessage, SafetyResult } from './types';

export { checkSafety } from './providers';
export type { SafetyCheckArgs, SafetyImage, SafetyMessage, SafetyResult } from './types';

export function interpretSafetyResult(result: SafetyResult): void {
  if (result.safe) {
    return;
  }

  throw new ResponsibleAIError('Input was blocked by the safety model');
}

export async function checkInputSafety(
  modelName: string,
  messages: SafetyMessage[],
  apiKeyId: string,
): Promise<void> {
  let result;
  try {
    result = await checkTextSafetyByName(modelName, messages, apiKeyId);
  } catch (error) {
    if (isKnownAiGenerationError(error)) {
      throw error;
    }

    throw new ResponsibleAIError(
      `Safety check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  interpretSafetyResult(result);
}

export async function checkTextSafetyByName(
  modelName: string,
  messages: SafetyMessage[],
  apiKeyId: string,
) {
  const model = await getSafetyModelByName(modelName, apiKeyId);
  return checkSafety(model, messages);
}
