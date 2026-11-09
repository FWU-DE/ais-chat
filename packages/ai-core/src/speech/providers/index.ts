import { ProviderConfigurationError } from '../../errors';
import {
  type AiModel,
  MP3_MIME_TYPE,
  type SpeechGenerationFn,
  type SpeechMimeType,
  type SpeechStreamGenerationFn,
  WAV_MIME_TYPE,
} from '../types';
import {
  constructBifrostSpeechGenerationFn,
  constructBifrostStreamingSpeechGenerationFn,
} from './bifrost';
import {
  constructGoogleSpeechGenerationFn,
  constructGoogleStreamingSpeechGenerationFn,
} from './google';

export function getSpeechGenerationFn(model: AiModel): SpeechGenerationFn {
  if (model.provider === 'google') {
    return constructGoogleSpeechGenerationFn(model);
  }
  if (model.provider === 'bifrost') {
    return constructBifrostSpeechGenerationFn(model);
  }

  throw new ProviderConfigurationError(
    `No speech generation function found for provider: ${model.provider}`,
  );
}

export function getStreamingSpeechGenerationFn(model: AiModel): SpeechStreamGenerationFn {
  if (model.provider === 'google') {
    return constructGoogleStreamingSpeechGenerationFn(model);
  }
  if (model.provider === 'bifrost') {
    return constructBifrostStreamingSpeechGenerationFn(model);
  }

  throw new ProviderConfigurationError(
    `No streaming speech generation function found for provider: ${model.provider}`,
  );
}

/**
 * Mime type a provider's non-streaming speech generation produces. Lets callers label cached
 * audio without re-running generation.
 */
export function getSpeechMimeType(provider: string): SpeechMimeType {
  return provider === 'google' ? WAV_MIME_TYPE : MP3_MIME_TYPE;
}
