import {
  type CatalogModel,
  getAllCatalogModels,
  getCatalogModelById,
  getCatalogModelByName,
  getCatalogModelsByApiKeyId,
} from '@ais-chat/ai-core/models/catalog';

import { env } from '../env';
import { LlmModelSelectModel } from '../schema';
import { dbGetFederalStateById } from './federal-state';

// The model catalog is owned by the API database; results are cached in-process for the db cache TTL.
const catalogCache = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

function withCatalogCache<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!env.dbCacheTtlSeconds) return load();

  const now = Date.now();
  const entry = catalogCache.get(key);
  if (entry && entry.expiresAt > now) return entry.value as Promise<T>;

  const value = load();
  catalogCache.set(key, { expiresAt: now + env.dbCacheTtlSeconds * 1000, value });
  value.catch(() => catalogCache.delete(key));
  return value;
}

function getModelsByApiKeyId(apiKeyId: string): Promise<CatalogModel[]> {
  return withCatalogCache(`api-key:${apiKeyId}`, () => getCatalogModelsByApiKeyId(apiKeyId));
}

async function getModelsByFederalStateId(federalStateId: string): Promise<CatalogModel[]> {
  const federalState = await dbGetFederalStateById(federalStateId);
  if (!federalState?.apiKeyId) return [];
  return getModelsByApiKeyId(federalState.apiKeyId);
}

export async function dbGetLlmModelById({
  modelId,
}: {
  modelId: string | undefined;
}): Promise<LlmModelSelectModel | undefined> {
  if (modelId === undefined) return undefined;
  return withCatalogCache(`id:${modelId}`, () => getCatalogModelById(modelId));
}

export async function dbGetModelByName(name: string): Promise<LlmModelSelectModel | undefined> {
  return withCatalogCache(`name:${name}`, () => getCatalogModelByName(name));
}

export async function dbGetAllLlmModels(): Promise<LlmModelSelectModel[]> {
  return withCatalogCache('all', () => getAllCatalogModels());
}

export async function dbGetSpeechModel() {
  const models = await dbGetAllLlmModels();
  return models.find((model) => model.isDeleted === false && model.priceMetadata.type === 'speech');
}

/** Returns all non-deleted models the federal state's API key has access to. */
export async function dbGetLlmModelsByFederalStateId({
  federalStateId,
}: {
  federalStateId: string;
}): Promise<LlmModelSelectModel[]> {
  const models = await getModelsByFederalStateId(federalStateId);
  return models.filter((model) => !model.isDeleted);
}

/** Finds a non-deleted model the federal state's API key has access to. */
export async function dbFindModelByIdAndFederalStateId({
  modelId,
  federalStateId,
}: {
  modelId: string;
  federalStateId: string;
}): Promise<LlmModelSelectModel | undefined> {
  const models = await dbGetLlmModelsByFederalStateId({ federalStateId });
  return models.find((model) => model.id === modelId);
}

/** Finds a model the federal state's API key has access to, including deleted ones. */
export async function dbGetModelByIdAndFederalStateId({
  modelId,
  federalStateId,
}: {
  modelId: string;
  federalStateId: string;
}): Promise<LlmModelSelectModel | undefined> {
  const models = await getModelsByFederalStateId(federalStateId);
  return models.find((model) => model.id === modelId);
}
