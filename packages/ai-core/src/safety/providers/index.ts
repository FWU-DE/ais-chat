import type { AiModel, SafetyMessage } from '../types';
import { constructGoogleSafetyCheckFn } from './google';

export async function checkSafety(model: AiModel, messages: SafetyMessage[]) {
  return constructGoogleSafetyCheckFn(model)({
    model: model.name,
    messages,
  });
}
