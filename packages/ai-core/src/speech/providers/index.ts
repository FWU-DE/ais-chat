import { ProviderConfigurationError } from '../../errors';
import type { AiModel, SpeechGenerationFn, SpeechStreamGenerationFn } from '../types';
import {
  constructBifrostSpeechGenerationFn,
  constructBifrostStreamingSpeechGenerationFn,
} from './bifrost';

export function getSpeechGenerationFn(model: AiModel): SpeechGenerationFn {
  if (model.provider === 'bifrost') {
    return constructBifrostSpeechGenerationFn(model);
  }

  throw new ProviderConfigurationError(
    `No speech generation function found for provider: ${model.provider}`,
  );
}

export function getStreamingSpeechGenerationFn(model: AiModel): SpeechStreamGenerationFn {
  if (model.provider === 'bifrost') {
    return constructBifrostStreamingSpeechGenerationFn(model);
  }

  throw new ProviderConfigurationError(
    `No streaming speech generation function found for provider: ${model.provider}`,
  );
}
