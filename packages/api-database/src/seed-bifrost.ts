import { syncAllBifrostProviders } from './bifrost-provider-sync';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { isLlmProvider } from './llm-model';
import {
  LlmModel,
  LlmInsertModel,
  llmModelProviderKeyMappingTable,
  llmProviderKeyTable,
} from './schema';

const BIFROST_UPSTREAM_PROVIDERS = new Set(['azure', 'openai', 'ionos', 'google']);

type SeedModel = LlmInsertModel | LlmModel;

export function normalizeSeedModelForBifrost<TModel extends SeedModel>(model: TModel): TModel {
  if (!BIFROST_UPSTREAM_PROVIDERS.has(model.setting.provider)) return model;

  return {
    ...model,
    provider: 'bifrost',
  };
}

export async function seedProviderKeysForModels(models: SeedModel[]): Promise<void> {
  const groupedModels = new Map<string, SeedModel[]>();
  for (const model of models) {
    if (!BIFROST_UPSTREAM_PROVIDERS.has(model.setting.provider)) continue;
    const providerKeySettings = getProviderKeySettings(model);
    const groupKey = `${model.organizationId}:${stableStringify(providerKeySettings)}`;
    groupedModels.set(groupKey, [...(groupedModels.get(groupKey) ?? []), model]);
  }

  for (const providerModels of groupedModels.values()) {
    const firstModel = providerModels[0];
    if (!firstModel) continue;
    const provider = firstModel.setting.provider;
    const settings = getProviderKeySettings(firstModel);
    const name = `${provider}-${createHash('sha256').update(stableStringify(settings)).digest('hex').slice(0, 8)}`;
    const [providerKey] = await db
      .insert(llmProviderKeyTable)
      .values({
        name,
        provider,
        settings,
        organizationId: firstModel.organizationId,
      })
      .onConflictDoUpdate({
        target: [llmProviderKeyTable.organizationId, llmProviderKeyTable.name],
        set: { provider, settings },
      })
      .returning();
    if (!providerKey) continue;

    for (const model of providerModels) {
      if (!model.id) continue;
      await db
        .delete(llmModelProviderKeyMappingTable)
        .where(
          and(
            eq(llmModelProviderKeyMappingTable.llmModelId, model.id),
            eq(llmModelProviderKeyMappingTable.providerKeyId, providerKey.id),
          ),
        );
      await db.insert(llmModelProviderKeyMappingTable).values({
        llmModelId: model.id,
        providerKeyId: providerKey.id,
        upstreamModelName: getUpstreamModelName(model),
      });
    }
  }
}

function getProviderKeySettings(model: SeedModel): SeedModel['setting'] {
  if (!isLlmProvider(model.setting, 'azure')) return model.setting;
  try {
    return { ...model.setting, baseUrl: new URL(model.setting.baseUrl).origin };
  } catch {
    return model.setting;
  }
}

export function normalizeSeedModelsForBifrost<TModel extends SeedModel>(
  models: TModel[],
): TModel[] {
  return models.map(normalizeSeedModelForBifrost);
}

export async function syncSeedModelsToBifrost(): Promise<void> {
  await syncAllBifrostProviders({
    bifrostAdminUrl: process.env.BIFROST_ADMIN_URL,
    bifrostAdminUsername: process.env.BIFROST_ADMIN_USERNAME,
    bifrostAdminPassword: process.env.BIFROST_ADMIN_PASSWORD,
    logger: {
      info: (message, context) => {
        console.log(message, context ?? '');
      },
      warning: (message, context) => {
        console.warn(message, context ?? '');
      },
      error: (message, error, context) => {
        console.error(message, error ?? '', context ?? '');
      },
    },
  });
}

function getUpstreamModelName(model: SeedModel): string {
  if (!isLlmProvider(model.setting, 'azure')) return model.name;
  try {
    const parts = new URL(model.setting.baseUrl).pathname.split('/').filter(Boolean);
    const deploymentIndex = parts.indexOf('deployments');
    if (deploymentIndex === -1) return model.name;
    return parts[deploymentIndex + 1] ?? model.name;
  } catch {
    return model.name;
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
