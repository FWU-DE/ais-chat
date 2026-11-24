import { assertApiKeyCanUseModel } from '../api-keys/access';
import { billImageGenerationUsageToApiKey } from '../api-keys/billing';
import { normalizeAiGenerationError, ResponsibleAIError } from '../errors';
import { getImageModelById, getImageModelByName } from '../models';
import { buildImageSafetyMessages, checkInputSafety } from '../safety';
import { generateImage } from './providers';
import { ImageGenerationRequestOptions } from './types';

const MAX_SAFETY_IMAGE_URL_LENGTH = 8 * 1024 * 1024;

/**
 * Generates an image using the specified model and prompt, with access control and billing.
 *
 * This function first verifies that the provided API key has access to the requested image model.
 * If access is granted, it generates the image and bills the usage to the API key.
 *
 * @param modelId - The image model to use for generation
 * @param prompt - The text prompt describing the desired image
 * @param apiKeyId - The ID of the API key to verify access and bill usage
 * @param options - Optional image generation options, such as output size
 *
 * @returns A promise that resolves to an object containing the generated image response and the price in cents
 */
export async function generateImageWithBilling(
  modelId: string,
  prompt: string,
  apiKeyId: string,
  options?: ImageGenerationRequestOptions,
  safetyModelName?: string,
) {
  const model = await getImageModelById(modelId);

  await assertApiKeyCanUseModel(apiKeyId, model, 'image');

  try {
    if (safetyModelName && model.safetyFilterEnabled) {
      const safetyImages = (options?.inputImages ?? []).map((image) => ({
        type: 'image' as const,
        contentType: image.mimeType,
        url: `data:${image.mimeType};base64,${image.data.toString('base64')}`,
      }));

      if (safetyImages.some((image) => image.url.length > MAX_SAFETY_IMAGE_URL_LENGTH)) {
        throw new ResponsibleAIError('Input image is too large for the safety model');
      }

      await checkInputSafety(
        safetyModelName,
        buildImageSafetyMessages(prompt, options?.inputImages),
        apiKeyId,
      );
    }

    const imageResponse = await generateImage(model, prompt, options);

    const priceInCents = await billImageGenerationUsageToApiKey(
      apiKeyId,
      model,
      imageResponse.usage,
    );

    return {
      ...imageResponse,
      // Non-Bifrost providers (and Bifrost responses that, for some reason, omit the routed
      // identity) fall back to the configured model's own provider/name.
      provider: imageResponse.provider ?? model.provider,
      modelName: imageResponse.modelName ?? model.name,
      priceInCents,
    };
  } catch (error) {
    throw normalizeAiGenerationError(error, 'Image generation failed');
  }
}

/**
 * Generates an image using a model looked up by name, with access control and billing.
 *
 * @param modelName - The name of the image model to use
 * @param prompt - The text prompt describing the desired image
 * @param apiKeyId - The ID of the API key to verify access and bill usage
 *
 * @returns A promise that resolves to an object containing the generated image response, price, and model metadata
 */
export async function generateImageByNameWithBilling(
  modelName: string,
  prompt: string,
  apiKeyId: string,
  options?: ImageGenerationRequestOptions,
  safetyModelName?: string,
) {
  const model = await getImageModelByName(modelName, apiKeyId);
  const result = await generateImageWithBilling(
    model.id,
    prompt,
    apiKeyId,
    options,
    safetyModelName,
  );
  return { ...result, model };
}
