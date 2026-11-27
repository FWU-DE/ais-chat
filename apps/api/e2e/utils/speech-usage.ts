import { randomUUID } from 'node:crypto';

import {
  type CompletionUsageModel,
  db,
  dbCreateApiKey,
  dbDeleteApiKey,
  dbGetModelByNameAndApiKeyId,
  dbValidateApiKey,
} from '@ais-chat/api-database';

import { authorizationHeader } from './api.js';

type SpeechUsageRecord = Pick<
  CompletionUsageModel,
  'apiKeyId' | 'modelId' | 'completionTokens' | 'promptTokens' | 'totalTokens'
>;

export async function withIsolatedSpeechApiKey(
  modelName: string,
  run: (context: {
    apiKeyId: string;
    modelId: string;
    headers: { Authorization: string };
    getUsage: () => Promise<SpeechUsageRecord[]>;
  }) => Promise<void>,
) {
  const sourceKey = await dbValidateApiKey(
    authorizationHeader.Authorization.slice('Bearer '.length),
  );
  if (!sourceKey.valid) {
    throw new Error(`Cannot create speech test key: ${sourceKey.reason}`);
  }

  const model = await dbGetModelByNameAndApiKeyId({
    name: modelName,
    apiKeyId: sourceKey.apiKey.id,
  });
  if (!model || model.priceMetadata.type !== 'speech') {
    throw new Error(`No speech model available with name: ${modelName}`);
  }

  const apiKey = await dbCreateApiKey({
    projectId: sourceKey.apiKey.projectId,
    name: `speech-usage-e2e-${randomUUID()}`,
    modelIds: [model.id],
    budget: sourceKey.apiKey.limitInCent,
  });

  try {
    await run({
      apiKeyId: apiKey.id,
      modelId: model.id,
      headers: { Authorization: `Bearer ${apiKey.plainKey}` },
      async getUsage() {
        const result = await db.$client.query<SpeechUsageRecord>(
          `SELECT api_key_id AS "apiKeyId", model_id AS "modelId",
                  completion_tokens AS "completionTokens", prompt_tokens AS "promptTokens",
                  total_tokens AS "totalTokens"
           FROM completion_usage_tracking WHERE api_key_id = $1`,
          [apiKey.id],
        );
        return result.rows;
      },
    });
  } finally {
    // Usage references the key, so remove only this test's records before deleting its key.
    await db.$client.query('DELETE FROM completion_usage_tracking WHERE api_key_id = $1', [
      apiKey.id,
    ]);
    await dbDeleteApiKey(apiKey.id);
  }
}
