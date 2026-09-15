import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  llmModelProviderKeyMappingTable,
  llmModelTable,
  llmProviderKeyTable,
  type LlmModel,
  type LlmProviderKeyInsertModel,
  type LlmProviderKeyModel,
} from '../schema';

export type LlmProviderKeyWithModels = LlmProviderKeyModel & {
  models: Array<{ model: LlmModel; upstreamModelName: string }>;
};

export async function dbGetAllProviderKeysWithModels(): Promise<LlmProviderKeyWithModels[]> {
  return getProviderKeysWithModels();
}

export async function dbGetProviderKeysWithModelsByOrganizationId(
  organizationId: string,
): Promise<LlmProviderKeyWithModels[]> {
  return getProviderKeysWithModels(organizationId);
}

async function getProviderKeysWithModels(
  organizationId?: string,
): Promise<LlmProviderKeyWithModels[]> {
  const query = db
    .select({
      providerKey: llmProviderKeyTable,
      model: llmModelTable,
      upstreamModelName: llmModelProviderKeyMappingTable.upstreamModelName,
    })
    .from(llmProviderKeyTable)
    .leftJoin(
      llmModelProviderKeyMappingTable,
      eq(llmModelProviderKeyMappingTable.providerKeyId, llmProviderKeyTable.id),
    )
    .leftJoin(llmModelTable, eq(llmModelTable.id, llmModelProviderKeyMappingTable.llmModelId))
    .orderBy(llmProviderKeyTable.createdAt);
  const rows = organizationId
    ? await query.where(eq(llmProviderKeyTable.organizationId, organizationId))
    : await query;
  const keys = new Map<string, LlmProviderKeyWithModels>();

  for (const row of rows) {
    const providerKey = keys.get(row.providerKey.id) ?? { ...row.providerKey, models: [] };
    if (row.model && row.upstreamModelName) {
      providerKey.models.push({ model: row.model, upstreamModelName: row.upstreamModelName });
    }
    keys.set(providerKey.id, providerKey);
  }

  return [...keys.values()];
}

export async function dbCreateProviderKey(providerKey: LlmProviderKeyInsertModel) {
  return (
    await db
      .insert(llmProviderKeyTable)
      .values({ ...providerKey, name: providerKey.name.toLowerCase() })
      .returning()
  )[0];
}

export async function dbUpdateProviderKey(
  id: string,
  organizationId: string,
  providerKey: Partial<LlmProviderKeyModel>,
) {
  return (
    await db
      .update(llmProviderKeyTable)
      .set({
        ...providerKey,
        ...(providerKey.name ? { name: providerKey.name.toLowerCase() } : {}),
      })
      .where(
        and(eq(llmProviderKeyTable.id, id), eq(llmProviderKeyTable.organizationId, organizationId)),
      )
      .returning()
  )[0];
}

export async function dbDeleteProviderKey(id: string, organizationId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [providerKey] = await tx
      .select({ id: llmProviderKeyTable.id })
      .from(llmProviderKeyTable)
      .where(
        and(eq(llmProviderKeyTable.id, id), eq(llmProviderKeyTable.organizationId, organizationId)),
      )
      .limit(1);
    if (!providerKey) return false;

    await tx
      .delete(llmModelProviderKeyMappingTable)
      .where(eq(llmModelProviderKeyMappingTable.providerKeyId, id));
    await tx.delete(llmProviderKeyTable).where(eq(llmProviderKeyTable.id, id));
    return true;
  });
}

export async function dbReplaceProviderKeyModelMappings({
  providerKeyId,
  organizationId,
  models,
}: {
  providerKeyId: string;
  organizationId: string;
  models: Array<{ modelId: string; upstreamModelName: string }>;
}) {
  await db.transaction(async (tx) => {
    const [providerKey] = await tx
      .select({ id: llmProviderKeyTable.id })
      .from(llmProviderKeyTable)
      .where(
        and(
          eq(llmProviderKeyTable.id, providerKeyId),
          eq(llmProviderKeyTable.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!providerKey) throw new Error('Provider key not found');

    const organizationModels = await tx
      .select({ id: llmModelTable.id })
      .from(llmModelTable)
      .where(eq(llmModelTable.organizationId, organizationId));
    const organizationModelIds = new Set(organizationModels.map(({ id }) => id));
    if (models.some(({ modelId }) => !organizationModelIds.has(modelId))) {
      throw new Error('Provider keys can only be assigned to models in the same organization');
    }

    await tx
      .delete(llmModelProviderKeyMappingTable)
      .where(eq(llmModelProviderKeyMappingTable.providerKeyId, providerKeyId));
    if (models.length > 0) {
      await tx.insert(llmModelProviderKeyMappingTable).values(
        models.map(({ modelId, upstreamModelName }) => ({
          providerKeyId,
          llmModelId: modelId,
          upstreamModelName,
        })),
      );
    }
  });
}

export async function dbReplaceModelProviderKeyMappings({
  modelId,
  organizationId,
  providerKeys,
}: {
  modelId: string;
  organizationId: string;
  providerKeys: Array<{ providerKeyId: string; upstreamModelName: string }>;
}) {
  await db.transaction(async (tx) => {
    const [model] = await tx
      .select({ id: llmModelTable.id })
      .from(llmModelTable)
      .where(and(eq(llmModelTable.id, modelId), eq(llmModelTable.organizationId, organizationId)))
      .limit(1);
    if (!model) throw new Error('Model not found');

    const organizationProviderKeys = await tx
      .select({ id: llmProviderKeyTable.id })
      .from(llmProviderKeyTable)
      .where(eq(llmProviderKeyTable.organizationId, organizationId));
    const providerKeyIds = new Set(organizationProviderKeys.map(({ id }) => id));
    if (providerKeys.some(({ providerKeyId }) => !providerKeyIds.has(providerKeyId))) {
      throw new Error('Models can only be assigned to provider keys in the same organization');
    }

    await tx
      .delete(llmModelProviderKeyMappingTable)
      .where(eq(llmModelProviderKeyMappingTable.llmModelId, modelId));
    if (providerKeys.length > 0) {
      await tx.insert(llmModelProviderKeyMappingTable).values(
        providerKeys.map(({ providerKeyId, upstreamModelName }) => ({
          llmModelId: modelId,
          providerKeyId,
          upstreamModelName,
        })),
      );
    }
  });
}

export async function dbGetModelIdByProviderAndUpstreamName({
  modelIds,
  provider,
  upstreamModelName,
}: {
  modelIds: string[];
  provider: string;
  upstreamModelName: string;
}): Promise<string | undefined> {
  if (modelIds.length === 0) return undefined;
  const normalizedProvider = provider === 'vertex' ? 'google' : provider;
  const [mapping] = await db
    .select({ modelId: llmModelProviderKeyMappingTable.llmModelId })
    .from(llmModelProviderKeyMappingTable)
    .innerJoin(
      llmProviderKeyTable,
      eq(llmProviderKeyTable.id, llmModelProviderKeyMappingTable.providerKeyId),
    )
    .where(
      and(
        inArray(llmModelProviderKeyMappingTable.llmModelId, modelIds),
        eq(llmModelProviderKeyMappingTable.upstreamModelName, upstreamModelName),
        eq(llmProviderKeyTable.provider, normalizedProvider),
      ),
    )
    .limit(1);
  return mapping?.modelId;
}

export async function dbGetDirectModelConfiguration(modelId: string) {
  const rows = await db
    .select({
      model: llmModelTable,
      providerKey: llmProviderKeyTable,
      upstreamModelName: llmModelProviderKeyMappingTable.upstreamModelName,
    })
    .from(llmModelProviderKeyMappingTable)
    .innerJoin(llmModelTable, eq(llmModelTable.id, llmModelProviderKeyMappingTable.llmModelId))
    .innerJoin(
      llmProviderKeyTable,
      eq(llmProviderKeyTable.id, llmModelProviderKeyMappingTable.providerKeyId),
    )
    .where(
      and(
        eq(llmModelProviderKeyMappingTable.llmModelId, modelId),
        eq(llmProviderKeyTable.isEnabled, true),
      ),
    );
  if (rows.length !== 1) return undefined;
  const row = rows[0]!;
  const setting =
    row.providerKey.settings.provider === 'azure'
      ? {
          ...row.providerKey.settings,
          baseUrl: `${row.providerKey.settings.baseUrl}/openai/deployments/${row.upstreamModelName}`,
        }
      : row.providerKey.settings;
  return {
    ...row.model,
    provider: row.providerKey.provider === 'google' ? 'google' : row.providerKey.provider,
    setting,
    name: row.upstreamModelName,
  };
}
