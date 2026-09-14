import type { AiModel } from '../types';
import { constructGoogleSafetyCheckFn } from './google';

export async function checkSafety(model: AiModel, text: string) {
  return constructGoogleSafetyCheckFn(model)({ model: model.name, text });
}
