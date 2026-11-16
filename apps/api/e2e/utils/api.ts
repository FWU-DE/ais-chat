import type { APIRequestContext } from '@playwright/test';

const API_KEY = process.env.DE_TEST_API_KEY;

if (!API_KEY) {
  throw new Error(
    'DE_TEST_API_KEY environment variable is required. Set it in apps/api/.env.local',
  );
}

export const authorizationHeader = {
  Authorization: `Bearer ${API_KEY}`,
};

type ApiModel = {
  name: string;
  isDeleted?: boolean;
  priceMetadata?: {
    type?: string;
  };
};

/**
 * Fetches available models from the API and returns the first model matching
 * the given predicate. Throws if no matching model is found.
 */
async function findModel(
  request: APIRequestContext,
  predicate: (model: ApiModel) => boolean,
  errorMessage: string,
): Promise<ApiModel> {
  const modelsResponse = await request.get('/v1/models', {
    headers: authorizationHeader,
  });
  const modelsPayload = (await modelsResponse.json()) as unknown;

  if (!modelsResponse.ok() || !Array.isArray(modelsPayload)) {
    throw new Error(
      `Failed to load models (${modelsResponse.status()}): ${JSON.stringify(modelsPayload)}`,
    );
  }

  const models = modelsPayload as Array<ApiModel>;
  const model = models.find(predicate);
  if (!model) {
    throw new Error(errorMessage);
  }
  return model;
}

/** Returns a text/chat model. Throws if none available. */
export async function getTextModel(request: APIRequestContext) {
  return findModel(
    request,
    (m) => !m.isDeleted && m.priceMetadata?.type === 'text',
    'No text model available',
  );
}

/** Finds a model by name. Throws if none available. */
export async function getModel(request: APIRequestContext, name: string) {
  return findModel(
    request,
    (m) => !m.isDeleted && m.name === name,
    `No model available with name: ${name}`,
  );
}

/** Returns an embedding model. Throws if none available. */
export async function getEmbeddingModel(request: APIRequestContext) {
  return findModel(
    request,
    (m) => !m.isDeleted && m.priceMetadata?.type === 'embedding',
    'No embedding model available',
  );
}

/** Returns an image generation model. Throws if none available. */
export async function getImageModel(request: APIRequestContext) {
  return findModel(
    request,
    (m) => !m.isDeleted && m.priceMetadata?.type === 'image',
    'No image generation model available',
  );
}
