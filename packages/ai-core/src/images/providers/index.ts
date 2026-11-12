import { ProviderConfigurationError } from '../../errors';
import type { AiModel, ImageGenerationFn, ImageGenerationRequestOptions } from '../types';
import { constructAzureImageGenerationFn } from './azure';
import { constructBifrostImageGenerationFn } from './bifrost';
import { constructGoogleImageGenerationFn } from './google';
import { constructIonosImageGenerationFn } from './ionos';

// This could probably be more direct, but it would require reworking the individual provider files
function getImageGenerationFnByModel({ model }: { model: AiModel }): ImageGenerationFn | undefined {
  if (model.provider === 'ionos') {
    return constructIonosImageGenerationFn(model);
  }
  if (model.provider === 'azure') {
    return constructAzureImageGenerationFn(model);
  }
  if (model.provider === 'google') {
    return constructGoogleImageGenerationFn(model);
  }
  if (model.provider === 'bifrost') {
    return constructBifrostImageGenerationFn(model);
  }

  return undefined;
}

export async function generateImage(
  model: AiModel,
  prompt: string,
  options?: ImageGenerationRequestOptions,
) {
  const generationFn = getImageGenerationFnByModel({ model });
  if (!generationFn) {
    throw new ProviderConfigurationError(
      `No image generation function found for provider: ${model.provider}`,
    );
  }
  return generationFn({ prompt, model: model.name, options });
}
