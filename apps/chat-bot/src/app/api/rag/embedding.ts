import { generateEmbeddingsWithBilling } from '@ais-chat/ai-core';
import { dbGetFederalStateWithApiKeyIdWithResult } from '@shared/db/functions/federal-state';
import { dbGetModelByName } from '@shared/db/functions/llm-model';
import { ChunkInsertModel } from '@shared/db/schema';
import { logDebug } from '@shared/logging';

import { EMBEDDING_BATCH_SIZE, EMBEDDING_MAX_CONCURRENT_REQUESTS } from '@/const';

import { UnembeddedChunk } from './types';

const EMBEDDING_MODEL = 'BAAI/bge-m3';

async function getEmbeddingModelWithApiKey(federalStateId: string) {
  const [apiKeyId, model] = await Promise.all([
    getFederalStateApiKeyId(federalStateId),
    dbGetModelByName(EMBEDDING_MODEL),
  ]);
  if (!model) throw new Error(`Embedding model ${EMBEDDING_MODEL} not found`);
  return { apiKeyId, modelId: model.id };
}

export async function embedText({
  text,
  federalStateId,
}: {
  text: string[];
  federalStateId: string;
}) {
  const { apiKeyId, modelId } = await getEmbeddingModelWithApiKey(federalStateId);

  // TODO: TD-526 Bill to user
  return await embedTextWithApiKey(text, modelId, apiKeyId);
}

async function getFederalStateApiKeyId(federalStateId: string) {
  const [error, federalStateObject] = await dbGetFederalStateWithApiKeyIdWithResult({
    federalStateId,
  });

  if (error !== null) {
    throw new Error(error.message);
  }

  return federalStateObject.apiKeyId;
}

async function embedTextWithApiKey(text: string[], modelId: string, federalStateApiKeyId: string) {
  const result = await generateEmbeddingsWithBilling(modelId, text, federalStateApiKeyId);

  return result.embeddings;
}

export async function embedChunks({
  chunksWithoutEmbeddings,
  federalStateId,
}: {
  chunksWithoutEmbeddings: UnembeddedChunk[];
  federalStateId: string;
}): Promise<ChunkInsertModel[]> {
  const { apiKeyId, modelId } = await getEmbeddingModelWithApiKey(federalStateId);

  logDebug(`Embedding ${chunksWithoutEmbeddings.length} chunks`);
  const promises: Promise<ChunkInsertModel[]>[] = [];
  // Process chunks in batches of 200
  for (let i = 0; i < chunksWithoutEmbeddings.length; i += EMBEDDING_BATCH_SIZE) {
    promises.push(
      (async () => {
        const batch = chunksWithoutEmbeddings.slice(i, i + EMBEDDING_BATCH_SIZE);
        const batchTexts = batch.map((value) => value.content);

        // TODO: TD-526 Bill to user
        const batchEmbeddings = await embedTextWithApiKey(batchTexts, modelId, apiKeyId);

        return batchEmbeddings.map((embedding, batchIndex) => {
          const chunk = chunksWithoutEmbeddings[i + batchIndex]!;
          return {
            ...chunk,
            embedding,
          };
        });
      })(),
    );

    if (promises.length % EMBEDDING_MAX_CONCURRENT_REQUESTS === 0) {
      logDebug('Awaiting embedding API calls due to rate limiting');
      await Promise.all(promises);
    }
  }

  return (await Promise.all(promises)).flat();
}
