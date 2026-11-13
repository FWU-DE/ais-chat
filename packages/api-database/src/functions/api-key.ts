import bcrypt from 'bcryptjs';
import { and, eq, getTableColumns, inArray } from 'drizzle-orm';

import { db } from '../db';
import {
  ApiKeyInsertModel,
  apiKeyTable,
  llmModelApiKeyMappingTable,
  llmModelTable,
  projectTable,
} from '../schema';
import { cnanoid } from '../utils';
import { type ApiKeyValidationResult, checkApiKeyUsable } from './api-key-validation';
import { dbGetProjectById } from './projects';

export async function dbLookupApiKeyByFullKey(fullApiKey: string) {
  const [sk, keyId, _secretKey] = fullApiKey.split('_');

  if (sk !== 'sk' || keyId === undefined || _secretKey === undefined) {
    return { valid: false as const, reason: 'Malformed api key' };
  }

  const apiKey = (await db.select().from(apiKeyTable).where(eq(apiKeyTable.keyId, keyId)))[0];
  return apiKey;
}

export async function dbCreateJustTheApiKey(
  apiKey: Omit<ApiKeyInsertModel, 'secretHash' | 'keyId'>,
) {
  const apiKeyRecord = await createApiKeyRecord();
  const apiKeyToInsert = {
    ...apiKey,
    secretHash: apiKeyRecord.secretHash,
    keyId: apiKeyRecord.keyId,
  };
  const insertedApiKey = (await db.insert(apiKeyTable).values(apiKeyToInsert).returning())[0];

  if (insertedApiKey === undefined) {
    throw new Error('Could not create api key');
  }
  return { ...insertedApiKey, plainKey: apiKeyRecord.fullKey };
}

export async function dbCreateApiKey({
  projectId,
  name,
  modelIds,
  budget,
}: {
  projectId: string;
  name: string;
  modelIds: string[];
  budget: number;
}) {
  if (modelIds.length < 1) {
    throw new Error('Cannot create api key without assigned models.');
  }

  const project = await dbGetProjectById(projectId);

  if (project === undefined) {
    throw new Error('Could not find project');
  }

  const apiKeyRecord = await createApiKeyRecord();

  return await db.transaction(async (tx) => {
    const insertedApiKey = (
      await tx
        .insert(apiKeyTable)
        .values({
          ...apiKeyRecord,
          projectId,
          name,
          limitInCent: budget,
        })
        .returning()
    )[0];

    if (insertedApiKey === undefined) {
      throw new Error('Could not create api key');
    }

    const availableModels = await tx
      .select()
      .from(llmModelTable)
      .where(inArray(llmModelTable.id, modelIds));

    const insertedMappings = await tx
      .insert(llmModelApiKeyMappingTable)
      .values(
        availableModels.map((model) => ({
          llmModelId: model.id,
          apiKeyId: insertedApiKey.id,
        })),
      )
      .returning();

    if (insertedMappings.length < 1) {
      throw new Error('Could not create any api key to model mappings');
    }

    return { ...insertedApiKey, plainKey: apiKeyRecord.fullKey };
  });
}

export async function dbGetAllApiKeysByProjectId(projectId: string) {
  return await db.select().from(apiKeyTable).where(eq(apiKeyTable.projectId, projectId));
}

export async function dbGetAllApiKeys() {
  return await db
    .select({
      id: apiKeyTable.id,
      name: apiKeyTable.name,
      projectName: projectTable.name,
    })
    .from(apiKeyTable)
    .innerJoin(projectTable, eq(apiKeyTable.projectId, projectTable.id))
    .orderBy(projectTable.name, apiKeyTable.name);
}

export async function dbGetApiKeysAndUsageByProjectId({ projectId }: { projectId: string }) {
  return await db.select().from(apiKeyTable).where(eq(apiKeyTable.projectId, projectId));
}

type ApiKeyParts = {
  keyId: string;
  secretKey: string;
  fullKey: string;
};

export function generateApiKey(): ApiKeyParts {
  const keyId = cnanoid(16);
  const secretKey = cnanoid(32);

  return {
    keyId,
    secretKey,
    fullKey: `sk_${keyId}_${secretKey}`,
  };
}

export async function hashSecretKey(secretKey: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(secretKey, saltRounds);
}

export async function dbValidateApiKey(fullApiKey: string): Promise<ApiKeyValidationResult> {
  const [sk, keyId, secretKey] = fullApiKey.split('_');

  if (sk !== 'sk' || keyId === undefined || secretKey === undefined) {
    return { valid: false, reason: 'Malformed api key' };
  }

  const apiKey = (await db.select().from(apiKeyTable).where(eq(apiKeyTable.keyId, keyId)))[0];

  const usable = checkApiKeyUsable(apiKey);
  if (!usable.valid) return usable;

  const isSameHash = await bcrypt.compare(secretKey, usable.apiKey.secretHash);

  if (!isSameHash) {
    return { valid: false, reason: 'Api key is invalid' };
  }

  return usable;
}

export async function dbValidateApiKeyById(apiKeyId: string): Promise<ApiKeyValidationResult> {
  return checkApiKeyUsable(await dbGetApiKeyById({ apiKeyId }));
}

export async function createApiKeyRecord(): Promise<{
  keyId: string;
  secretHash: string;
  fullKey: string;
}> {
  const { keyId, secretKey, fullKey } = generateApiKey();
  const hashedSecret = await hashSecretKey(secretKey);

  return {
    keyId,
    secretHash: hashedSecret,
    fullKey,
  };
}

export async function dbGetApiKeyById({ apiKeyId }: { apiKeyId: string }) {
  return (await db.select().from(apiKeyTable).where(eq(apiKeyTable.id, apiKeyId)))[0];
}

export async function dbGetApiKey(projectId: string, apiKeyId: string) {
  return (
    await db
      .select()
      .from(apiKeyTable)
      .where(and(eq(apiKeyTable.id, apiKeyId), eq(apiKeyTable.projectId, projectId)))
  )[0];
}

export async function dbDeleteApiKey(apiKeyId: string) {
  return await db.transaction(async (tx) => {
    // Delete with join is not supported in Drizzle atm.

    // First, delete all llm_model_api_key_mappings associated with this API key
    await tx
      .delete(llmModelApiKeyMappingTable)
      .where(eq(llmModelApiKeyMappingTable.apiKeyId, apiKeyId));

    // Then delete the API key itself
    await tx.delete(apiKeyTable).where(eq(apiKeyTable.id, apiKeyId));

    return;
  });
}

export async function dbGetAllModelMappingsForApiKey(projectId: string, apiKeyId: string) {
  return await db
    .select({ ...getTableColumns(llmModelApiKeyMappingTable) })
    .from(llmModelApiKeyMappingTable)
    .innerJoin(apiKeyTable, eq(llmModelApiKeyMappingTable.apiKeyId, apiKeyTable.id))
    .where(and(eq(apiKeyTable.id, apiKeyId), eq(apiKeyTable.projectId, projectId)));
}

export async function dbUpdateModelMappingsForApiKey(
  projectId: string,
  apiKeyId: string,
  modelIds: string[],
) {
  return await db.transaction(async (tx) => {
    // First verify the API key exists and belongs to the project
    const apiKey = await tx
      .select({ id: apiKeyTable.id })
      .from(apiKeyTable)
      .where(and(eq(apiKeyTable.id, apiKeyId), eq(apiKeyTable.projectId, projectId)))
      .limit(1);

    if (apiKey.length === 0) {
      throw new Error('API key not found');
    }

    // Verify all model IDs exist
    const availableModels = await tx
      .select()
      .from(llmModelTable)
      .where(inArray(llmModelTable.id, modelIds));

    if (availableModels.length !== modelIds.length) {
      throw new Error('Some model IDs are invalid');
    }

    // Delete existing mappings for this API key
    await tx
      .delete(llmModelApiKeyMappingTable)
      .where(eq(llmModelApiKeyMappingTable.apiKeyId, apiKeyId));

    // Create new mappings
    if (modelIds.length > 0) {
      await tx.insert(llmModelApiKeyMappingTable).values(
        modelIds.map((modelId) => ({
          llmModelId: modelId,
          apiKeyId: apiKeyId,
        })),
      );
    }

    // Return the updated mappings
    return await tx
      .select({ ...getTableColumns(llmModelApiKeyMappingTable) })
      .from(llmModelApiKeyMappingTable)
      .innerJoin(llmModelTable, eq(llmModelApiKeyMappingTable.llmModelId, llmModelTable.id))
      .where(eq(llmModelApiKeyMappingTable.apiKeyId, apiKeyId));
  });
}

export async function dbGetApiKeyIdsForModel(modelId: string) {
  const rows = await db
    .select({ apiKeyId: llmModelApiKeyMappingTable.apiKeyId })
    .from(llmModelApiKeyMappingTable)
    .where(eq(llmModelApiKeyMappingTable.llmModelId, modelId));

  return rows.map((row) => row.apiKeyId);
}

export async function dbSetApiKeysForModel(modelId: string, apiKeyIds: string[]) {
  return await db.transaction(async (tx) => {
    const [model] = await tx
      .select({ id: llmModelTable.id })
      .from(llmModelTable)
      .where(eq(llmModelTable.id, modelId))
      .limit(1);

    if (!model) {
      throw new Error('Model not found');
    }

    const availableApiKeys = await tx
      .select({ id: apiKeyTable.id })
      .from(apiKeyTable)
      .where(inArray(apiKeyTable.id, apiKeyIds));

    if (availableApiKeys.length !== apiKeyIds.length) {
      throw new Error('Some API key IDs are invalid');
    }

    await tx
      .delete(llmModelApiKeyMappingTable)
      .where(eq(llmModelApiKeyMappingTable.llmModelId, modelId));

    if (apiKeyIds.length > 0) {
      await tx.insert(llmModelApiKeyMappingTable).values(
        apiKeyIds.map((apiKeyId) => ({
          llmModelId: modelId,
          apiKeyId,
        })),
      );
    }
  });
}

export async function dbUpdateApiKey(
  projectId: string,
  apiKeyId: string,
  updates: {
    name?: string;
    state?: 'active' | 'inactive' | 'deleted';
    limitInCent?: number;
    expiresAt?: Date | null;
  },
) {
  return await db.transaction(async (tx) => {
    // First verify the API key exists and belongs to the project
    const existingApiKey = await tx
      .select({ id: apiKeyTable.id })
      .from(apiKeyTable)
      .where(and(eq(apiKeyTable.id, apiKeyId), eq(apiKeyTable.projectId, projectId)))
      .limit(1);

    if (existingApiKey.length === 0) {
      throw new Error('API key not found');
    }

    // Update the API key with provided values
    const [updatedApiKey] = await tx
      .update(apiKeyTable)
      .set(updates)
      .where(eq(apiKeyTable.id, apiKeyId))
      .returning();

    if (updatedApiKey === undefined) {
      throw new Error('Failed to update API key');
    }

    // Return the updated API key without sensitive fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { keyId, secretHash, ...apiKey } = updatedApiKey;
    return apiKey;
  });
}
