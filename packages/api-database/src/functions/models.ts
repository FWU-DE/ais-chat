import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../db';
import type { LlmInsertModel, LlmModel, LlmModelWithSecrets } from '../schema';
import {
  llmModelApiKeyMappingTable,
  llmModelProviderKeyMappingTable,
  llmModelTable,
} from '../schema';
import { dbGetAllApiKeys } from './api-key';

// Public model columns for consumers outside the API; never expose provider settings or parameters.
const llmModelColumns: { [K in keyof LlmModel]: (typeof llmModelTable)[K] } = {
  id: llmModelTable.id,
  provider: llmModelTable.provider,
  name: llmModelTable.name,
  displayName: llmModelTable.displayName,
  description: llmModelTable.description,
  priceMetadata: llmModelTable.priceMetadata,
  createdAt: llmModelTable.createdAt,
  supportedImageFormats: llmModelTable.supportedImageFormats,
  imageGenerationConfig: llmModelTable.imageGenerationConfig,
  modelConfig: llmModelTable.modelConfig,
  isNew: llmModelTable.isNew,
  isDeleted: llmModelTable.isDeleted,
  vendor: llmModelTable.vendor,
  reasoning: llmModelTable.reasoning,
};

// LlmModel reads are cached (when a TTL is configured) since they are queried frequently by ais-chat-app.
export async function dbGetAllLlmModels(): Promise<LlmModel[]> {
  return db
    .select(llmModelColumns)
    .from(llmModelTable)
    .orderBy(llmModelTable.createdAt)
    .$withCache();
}

export async function dbGetLlmModelById(modelId: string): Promise<LlmModel | undefined> {
  const [model] = await db
    .select(llmModelColumns)
    .from(llmModelTable)
    .where(eq(llmModelTable.id, modelId))
    .$withCache();
  return model;
}

export async function dbGetLlmModelByName(name: string): Promise<LlmModel | undefined> {
  const [model] = await db
    .select(llmModelColumns)
    .from(llmModelTable)
    .where(eq(llmModelTable.name, name))
    .$withCache();
  return model;
}

/** Returns all models (including deleted ones) the given API key has access to. */
export async function dbGetLlmModelsByApiKeyId(apiKeyId: string): Promise<LlmModel[]> {
  // Subquery instead of a join: mapping rows are not unique per (model, api key)
  const mappedModelIds = db
    .select({ id: llmModelApiKeyMappingTable.llmModelId })
    .from(llmModelApiKeyMappingTable)
    .where(eq(llmModelApiKeyMappingTable.apiKeyId, apiKeyId));

  return db
    .select(llmModelColumns)
    .from(llmModelTable)
    .where(inArray(llmModelTable.id, mappedModelIds))
    .orderBy(llmModelTable.createdAt)
    .$withCache();
}

export async function dbGetAllModels() {
  return db.select().from(llmModelTable).orderBy(llmModelTable.createdAt);
}

export async function dbGetModelById(id: string) {
  return (await db.select().from(llmModelTable).where(eq(llmModelTable.id, id)))[0];
}

export async function dbGetModelByNameAndApiKeyId({
  name,
  apiKeyId,
}: {
  name: string;
  apiKeyId: string;
}) {
  const rows = await db
    .select()
    .from(llmModelTable)
    .innerJoin(
      llmModelApiKeyMappingTable,
      eq(llmModelApiKeyMappingTable.llmModelId, llmModelTable.id),
    )
    .where(and(eq(llmModelTable.name, name), eq(llmModelApiKeyMappingTable.apiKeyId, apiKeyId)))
    .limit(1);

  return rows[0]?.llm_model;
}

export async function dbHasApiKeyAccessToModel({
  apiKeyId,
  modelId,
}: {
  apiKeyId: string;
  modelId: string;
}): Promise<boolean> {
  const rows = await db
    .select({ id: llmModelApiKeyMappingTable.id })
    .from(llmModelApiKeyMappingTable)
    .where(
      and(
        eq(llmModelApiKeyMappingTable.apiKeyId, apiKeyId),
        eq(llmModelApiKeyMappingTable.llmModelId, modelId),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * Returns the list of llm models linked to the given API key.
 * The deleted flag is ignored for now because ais-chat-app needs all models and the deleted flag needs to be mirrored.
 * @param apiKeyId: The id of the API key.
 * @returns
 */
export async function dbGetModelsByApiKeyId({ apiKeyId }: { apiKeyId: string }) {
  const rows = await db
    .select()
    .from(llmModelTable)
    .innerJoin(
      llmModelApiKeyMappingTable,
      eq(llmModelApiKeyMappingTable.llmModelId, llmModelTable.id),
    )
    .where(eq(llmModelApiKeyMappingTable.apiKeyId, apiKeyId));

  return rows.map((r) => r.llm_model);
}

export async function dbCreateLlmModel(llmModel: LlmInsertModel) {
  const modelCreated = await db
    .insert(llmModelTable)
    .values({ ...llmModel })
    .returning();
  return modelCreated[0];
}

export async function dbUpdateLlmModel(id: string, llmModel: Partial<LlmModelWithSecrets>) {
  const updatedModel = (
    await db
      .update(llmModelTable)
      .set({ ...llmModel })
      .where(eq(llmModelTable.id, id))
      .returning()
  )[0];

  return updatedModel;
}

export async function dbDeleteLlmModelById(id: string) {
  return (await db.delete(llmModelTable).where(eq(llmModelTable.id, id)).returning())[0];
}

export async function dbDeleteLlmModel(id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [model] = await tx
      .select({ id: llmModelTable.id })
      .from(llmModelTable)
      .where(eq(llmModelTable.id, id))
      .limit(1);
    if (!model) return false;

    await tx
      .delete(llmModelProviderKeyMappingTable)
      .where(eq(llmModelProviderKeyMappingTable.llmModelId, id));
    await tx
      .delete(llmModelApiKeyMappingTable)
      .where(eq(llmModelApiKeyMappingTable.llmModelId, id));
    await tx.delete(llmModelTable).where(eq(llmModelTable.id, id));
    return true;
  });
}

export async function dbGetModelsByIds({ modelIds }: { modelIds: string[] }) {
  if (modelIds.length < 1) return [];

  return await db.select().from(llmModelTable).where(inArray(llmModelTable.id, modelIds));
}

export async function dbCreateModelWithApiKeyLinks({
  provider,
  name,
  displayName,
  description = '',
  setting,
  priceMetadata,
  apiKeyNames,
  isNew,
  isDeleted,
}: LlmInsertModel & { apiKeyNames?: string[] }): Promise<
  | {
      error: string;
    }
  | {
      model: LlmModelWithSecrets;
      linkedApiKeys: { id: string; name: string }[];
    }
> {
  // Logical model names are unique regardless of upstream provider.
  const existingModel = await db.select().from(llmModelTable).where(eq(llmModelTable.name, name));
  if (existingModel.length > 0) {
    return {
      error: 'A model with this name already exists.',
    };
  }

  // Create the model
  const [model] = await db
    .insert(llmModelTable)
    .values({
      provider,
      name,
      displayName,
      description: description ?? '',
      setting,
      priceMetadata,
      isNew,
      isDeleted,
    })
    .returning();

  if (!model) {
    return { error: 'Failed to create model' };
  }

  const allApiKeys = await dbGetAllApiKeys();
  if (!allApiKeys.length) {
    return { error: 'No API keys found' };
  }
  // Find API keys by name
  const apiKeysToLink =
    apiKeyNames
      ?.map((name) => {
        return allApiKeys.find((k) => k.name === name);
      })
      .filter((k) => k !== undefined) ?? allApiKeys;

  if (apiKeysToLink === undefined) {
    return { error: 'One or more API key names not found' };
  }
  // Link model to API keys
  if (apiKeysToLink.length > 0) {
    await db.insert(llmModelApiKeyMappingTable).values(
      apiKeysToLink.map((apiKey) => ({
        llmModelId: model.id,
        apiKeyId: apiKey.id,
      })),
    );
  }

  return {
    model,
    linkedApiKeys: apiKeysToLink,
  };
}
