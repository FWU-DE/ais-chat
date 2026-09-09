import { isApiKeyOverQuota } from '../api-keys/billing';
import { generateEmbeddings } from './providers';
import { hasAccessToModel } from '../api-keys/model-access';
import { InvalidModelError, normalizeAiGenerationError, RateLimitExceededError } from '../errors';
import { getEmbeddingModelById, getEmbeddingModelByName } from '../models';

/**
 * Generates embeddings using the specified model and texts, with access control.
 *
 * This function first verifies that the provided API key has access to the requested embedding model.
 * If access is granted, it generates the embeddings.
 * Note: Embeddings are typically not billed per request, but per token count which would need separate tracking.
 *
 * @param modelId - The ID of the embedding model to use for generation
 * @param texts - Array of text strings to embed
 * @param apiKeyId - The ID of the API key to verify access
 *
 * @returns A promise that resolves to an object containing the generated embeddings
 */
export async function generateEmbeddingsWithBilling(
  modelId: string,
  texts: string[],
  apiKeyId: string,
) {
  const model = await getEmbeddingModelById(modelId);

  // Run access check and quota check in parallel for better performance
  const [hasAccess, isOverQuota] = await Promise.all([
    hasAccessToModel(apiKeyId, model),
    isApiKeyOverQuota(apiKeyId),
  ]);

  if (!hasAccess) {
    throw new InvalidModelError(
      `API key does not have access to the embedding model: ${model.name}`,
    );
  }

  if (isOverQuota) {
    throw new RateLimitExceededError(`API key has exceeded its monthly quota`);
  }

  try {
    const embeddingResponse = await generateEmbeddings(model, texts);

    // TODO: Add billing for embeddings based on token usage

    return embeddingResponse;
  } catch (error) {
    throw normalizeAiGenerationError(error, 'Embedding generation failed');
  }
}

/**
 * Generates embeddings using a model looked up by name, with access control.
 *
 * @param modelName - The name of the embedding model to use
 * @param texts - Array of text strings to embed
 * @param apiKeyId - The ID of the API key to verify access
 *
 * @returns A promise that resolves to an object containing the generated embeddings and model metadata
 */
export async function generateEmbeddingsByNameWithBilling(
  modelName: string,
  texts: string[],
  apiKeyId: string,
) {
  const model = await getEmbeddingModelByName(modelName, apiKeyId);
  const result = await generateEmbeddingsWithBilling(model.id, texts, apiKeyId);
  return { ...result, model };
}
