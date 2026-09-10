import { billImageGenerationUsageToApiKey, isApiKeyOverQuota } from '../api-keys/billing';
import { generateImage } from './providers';
import { hasAccessToModel } from '../api-keys/model-access';
import { AiGenerationError, InvalidModelError } from '../errors';
import { getImageModelById, getImageModelByName } from '../models';
import { ImageGenerationRequestOptions } from './types';
import { checkInputSafety } from '../safety';

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

  // Run access check and quota check in parallel for better performance
  const [hasAccess, isOverQuota] = await Promise.all([
    hasAccessToModel(apiKeyId, model),
    isApiKeyOverQuota(apiKeyId),
  ]);

  if (!hasAccess) {
    throw new InvalidModelError(`API key does not have access to the image model: ${model.name}`);
  }

  if (isOverQuota) {
    throw new AiGenerationError(`API key has exceeded its monthly quota`);
  }

  try {
    if (safetyModelName) {
      await checkInputSafety(
        safetyModelName,
        [
          {
            role: 'user',
            content: prompt,
            images: (options?.inputImages ?? []).map((image) => ({
              type: 'image' as const,
              contentType: image.mimeType,
              url: `data:${image.mimeType};base64,${image.data.toString('base64')}`,
            })),
          },
        ],
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
      priceInCents,
    };
  } catch (error) {
    // Wrap non-AiGenerationError errors
    if (!(error instanceof AiGenerationError)) {
      throw new AiGenerationError(
        `Image generation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    throw error;
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
