import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { isCustomOpenAiProviderId } from '../bifrost-provider-sync/provider-config-builder/openai-compatible';
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

async function getProviderKeysWithModels(): Promise<LlmProviderKeyWithModels[]> {
  const rows = await db
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

export async function dbUpdateProviderKey(id: string, providerKey: Partial<LlmProviderKeyModel>) {
  return (
    await db
      .update(llmProviderKeyTable)
      .set({
        ...providerKey,
        ...(providerKey.name ? { name: providerKey.name.toLowerCase() } : {}),
      })
      .where(eq(llmProviderKeyTable.id, id))
      .returning()
  )[0];
}

export async function dbDeleteProviderKey(id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [providerKey] = await tx
      .select({ id: llmProviderKeyTable.id })
      .from(llmProviderKeyTable)
      .where(eq(llmProviderKeyTable.id, id))
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
  models,
}: {
  providerKeyId: string;
  models: Array<{ modelId: string; upstreamModelName: string }>;
}) {
  await db.transaction(async (tx) => {
    const [providerKey] = await tx
      .select({ id: llmProviderKeyTable.id })
      .from(llmProviderKeyTable)
      .where(eq(llmProviderKeyTable.id, providerKeyId))
      .limit(1);
    if (!providerKey) throw new Error('Provider key not found');

    const existingModels = await tx.select({ id: llmModelTable.id }).from(llmModelTable);
    const existingModelIds = new Set(existingModels.map(({ id }) => id));
    if (models.some(({ modelId }) => !existingModelIds.has(modelId))) {
      throw new Error('Provider keys can only be assigned to existing models');
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
  providerKeys,
}: {
  modelId: string;
  providerKeys: Array<{ providerKeyId: string; upstreamModelName: string }>;
}) {
  await db.transaction(async (tx) => {
    const [model] = await tx
      .select({ id: llmModelTable.id })
      .from(llmModelTable)
      .where(eq(llmModelTable.id, modelId))
      .limit(1);
    if (!model) throw new Error('Model not found');

    const existingProviderKeys = await tx
      .select({ id: llmProviderKeyTable.id })
      .from(llmProviderKeyTable);
    const providerKeyIds = new Set(existingProviderKeys.map(({ id }) => id));
    if (providerKeys.some(({ providerKeyId }) => !providerKeyIds.has(providerKeyId))) {
      throw new Error('Models can only be assigned to existing provider keys');
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
  const normalizedProvider =
    provider === 'vertex' ? 'google' : isCustomOpenAiProviderId(provider) ? 'openai' : provider;
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
