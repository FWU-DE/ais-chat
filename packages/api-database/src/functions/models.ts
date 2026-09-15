import { eq, inArray, and } from 'drizzle-orm';
import {
  llmModelApiKeyMappingTable,
  llmModelProviderKeyMappingTable,
  llmModelTable,
} from '../schema';
import { db } from '../db';
import { dbGetAllApiKeysByProjectId } from './api-key';
import { dbGetOrganizationAndProjectsByOrganizationId } from './organization';
import type { LlmInsertModel, LlmModel } from '../schema';

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

export async function dbGetAllModelsByOrganizationId(organizationId: string) {
  return await db
    .select()
    .from(llmModelTable)
    .where(eq(llmModelTable.organizationId, organizationId))
    .orderBy(llmModelTable.name, llmModelTable.createdAt);
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

export async function dbUpdateLlmModel(
  id: string,
  organizationId: string,
  llmModel: Partial<LlmModel>,
) {
  const updatedModel = (
    await db
      .update(llmModelTable)
      .set({ ...llmModel })
      .where(and(eq(llmModelTable.id, id), eq(llmModelTable.organizationId, organizationId)))
      .returning()
  )[0];

  return updatedModel;
}

export async function dbDeleteLlmModelById(id: string) {
  return (await db.delete(llmModelTable).where(eq(llmModelTable.id, id)).returning())[0];
}

export async function dbDeleteLlmModel(id: string, organizationId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [model] = await tx
      .select({ id: llmModelTable.id })
      .from(llmModelTable)
      .where(and(eq(llmModelTable.id, id), eq(llmModelTable.organizationId, organizationId)))
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

// Helper to get all API keys in an organization
export async function getAllApiKeys(
  organizationId: string,
): Promise<{ id: string; name: string }[]> {
  const orgWithProjects = await dbGetOrganizationAndProjectsByOrganizationId({
    organizationId,
  });
  if (!orgWithProjects) return [];
  const allApiKeys: { id: string; name: string }[] = [];
  for (const project of orgWithProjects.projects) {
    const keys = await dbGetAllApiKeysByProjectId(organizationId, project.id);
    allApiKeys.push(...keys.map((k) => ({ id: k.id, name: k.name })));
  }
  return allApiKeys;
}

export async function dbCreateModelWithApiKeyLinks({
  provider,
  name,
  displayName,
  description = '',
  setting,
  priceMetadata,
  organizationId,
  apiKeyNames,
  isNew,
  isDeleted,
}: LlmInsertModel & { apiKeyNames?: string[] }): Promise<
  | {
      error: string;
    }
  | {
      model: LlmModel;
      linkedApiKeys: { id: string; name: string }[];
    }
> {
  // Logical model names are unique within an organization regardless of upstream provider.
  const existingModel = await db
    .select()
    .from(llmModelTable)
    .where(and(eq(llmModelTable.name, name), eq(llmModelTable.organizationId, organizationId)));
  if (existingModel.length > 0) {
    return {
      error: 'A model with this name already exists for this organization.',
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
      organizationId,
      isNew,
      isDeleted,
    })
    .returning();

  if (!model) {
    return { error: 'Failed to create model' };
  }

  const allApiKeys = await getAllApiKeys(organizationId);
  if (!allApiKeys.length) {
    return { error: 'Organization not found' };
  }
  // Find API keys by name
  const apiKeysToLink =
    apiKeyNames
      ?.map((name) => {
        return allApiKeys.find((k) => k.name === name);
      })
      .filter((k) => k !== undefined) ?? allApiKeys;

  if (apiKeysToLink === undefined) {
    return { error: 'One or more API key names not found in organization' };
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
