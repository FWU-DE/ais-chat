import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { db as localDb } from './index';
import {
  ApiKeyModel,
  apiKeyTable,
  LlmModel,
  LlmModelApiKeyMappingModel,
  llmModelApiKeyMappingTable,
  LlmModelProviderKeyMappingModel,
  llmModelProviderKeyMappingTable,
  llmModelTable,
  LlmProviderKeyModel,
  llmProviderKeyTable,
  ProjectModel,
  projectTable,
} from './schema';
import { normalizeSeedModelsForBifrost, syncSeedModelsToBifrost } from './seed-bifrost';

// Loads all required data from the staging database into the local database
// including projects, api keys, llm models and mappings.
// Does not copy over user data or usage data.
// Useful for local development to have the same models and api keys as staging.

const connectionString = process.env.STAGE_DATABASE_URL;
if (!connectionString) {
  throw new Error('STAGE_DATABASE_URL is not set');
}
const pool = new Pool({
  connectionString,
  max: 12,
});
const stageDb = drizzle({ client: pool });

async function getProjects(): Promise<ProjectModel[]> {
  return await stageDb.select().from(projectTable);
}

async function getApiKeys(): Promise<ApiKeyModel[]> {
  return await stageDb.select().from(apiKeyTable);
}

async function getModels(): Promise<LlmModel[]> {
  return await stageDb.select().from(llmModelTable);
}

async function getModelKeyMappings(): Promise<LlmModelApiKeyMappingModel[]> {
  return await stageDb.select().from(llmModelApiKeyMappingTable);
}

async function getProviderKeys(): Promise<LlmProviderKeyModel[]> {
  return await stageDb.select().from(llmProviderKeyTable);
}

async function getModelProviderKeyMappings(): Promise<LlmModelProviderKeyMappingModel[]> {
  return await stageDb.select().from(llmModelProviderKeyMappingTable);
}

export async function seedDatabase() {
  console.log('Starting database seeding...');

  try {
    const models = normalizeSeedModelsForBifrost(await getModels());

    // 1. Create project
    await localDb
      .insert(projectTable)
      .values(await getProjects())
      .onConflictDoNothing()
      .returning();

    // 2. Create API keys
    await localDb
      .insert(apiKeyTable)
      .values(await getApiKeys())
      .onConflictDoNothing()
      .returning();

    // 3. Create LLM models
    for (const model of models) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, createdAt: _createdAt, ...conflictSet } = model;
      await localDb
        .insert(llmModelTable)
        .values(model)
        .onConflictDoUpdate({
          target: llmModelTable.id,
          set: conflictSet,
        })
        .returning();
    }

    const localProviderKeyIds = new Map<string, string>();
    for (const providerKey of await getProviderKeys()) {
      const [localProviderKey] = await localDb
        .insert(llmProviderKeyTable)
        .values({ ...providerKey, name: providerKey.name.toLowerCase() })
        .onConflictDoUpdate({
          target: llmProviderKeyTable.name,
          set: {
            provider: providerKey.provider,
            settings: providerKey.settings,
            weight: providerKey.weight,
            isEnabled: providerKey.isEnabled,
          },
        })
        .returning({ id: llmProviderKeyTable.id });
      if (localProviderKey) localProviderKeyIds.set(providerKey.id, localProviderKey.id);
    }

    const modelProviderKeyMappings = (await getModelProviderKeyMappings()).map((mapping) => ({
      ...mapping,
      providerKeyId: localProviderKeyIds.get(mapping.providerKeyId) ?? mapping.providerKeyId,
    }));
    if (modelProviderKeyMappings.length > 0) {
      await localDb
        .insert(llmModelProviderKeyMappingTable)
        .values(modelProviderKeyMappings)
        .onConflictDoNothing();
    }

    // 4. Create model-key mappings
    await localDb
      .insert(llmModelApiKeyMappingTable)
      .values(await getModelKeyMappings())
      .onConflictDoNothing()
      .returning();

    await syncSeedModelsToBifrost();

    // 5. Summary
    console.log('Database seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
}

try {
  await seedDatabase();
  console.log('Seeding completed');
  process.exit(0);
} catch (error) {
  console.error('Seeding failed:', error);
  process.exit(1);
}
