import { ProviderConfigurationError } from '../../errors';
import type { AiModel, SafetyCheckFn } from '../types';
import { constructBifrostSafetyCheckFn } from './bifrost';
import { constructGoogleSafetyCheckFn } from './google';

function getSafetyCheckFnByModel(model: AiModel): SafetyCheckFn | undefined {
  if (model.provider === 'google') {
    return constructGoogleSafetyCheckFn(model);
  }
  if (model.provider === 'bifrost') {
    return constructBifrostSafetyCheckFn(model);
  }
  return undefined;
}

export async function checkSafety(model: AiModel, text: string) {
  const checkFn = getSafetyCheckFnByModel(model);
  if (!checkFn) {
    throw new ProviderConfigurationError(
      `No safety check function found for provider: ${model.provider}`,
    );
  }
  return checkFn({ model: model.name, text });
}
