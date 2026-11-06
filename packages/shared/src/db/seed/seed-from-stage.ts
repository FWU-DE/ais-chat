import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { db as localDb } from '..';
import {
  Configuration,
  configurationTable,
  FederalStateLlmModelMappingSelectModel,
  federalStateLlmModelMappingTable,
  FederalStateSelectModel,
  federalStateTable,
  LlmModelSelectModel,
  llmModelTable,
} from '../schema';
import {
  insertTemplateAssistant,
  insertTemplateCharacters,
  insertTemplateLearningScenarios,
} from './default-templates';
import { insertHelpModeGpt } from './help-mode';
import { insertDummyUser } from './user-entity';

// Loads configuration data from the staging database into the local database
// including federal states, schools, llm models and federal-state-to-model mappings.
// Does not copy over user data, conversations, or usage data.
// Useful for local development to have the same configuration as staging.

const connectionString = process.env.STAGE_DATABASE_URL;
if (!connectionString) {
  throw new Error('STAGE_DATABASE_URL is not set');
}
const pool = new Pool({
  connectionString,
  max: 12,
});
const stageDb = drizzle({ client: pool });

async function getFederalStates(): Promise<FederalStateSelectModel[]> {
  return await stageDb.select().from(federalStateTable);
}

async function getLlmModels(): Promise<LlmModelSelectModel[]> {
  return await stageDb.select().from(llmModelTable);
}

async function getFederalStateLlmModelMappings(): Promise<
  FederalStateLlmModelMappingSelectModel[]
> {
  return await stageDb.select().from(federalStateLlmModelMappingTable);
}

async function getConfigurations(): Promise<Configuration[]> {
  return await stageDb.select().from(configurationTable);
}

async function seedDatabase() {
  console.log('Starting database seeding from stage...');

  try {
    await localDb
      .insert(federalStateTable)
      .values(await getFederalStates())
      .onConflictDoNothing();

    await localDb
      .insert(llmModelTable)
      .values(await getLlmModels())
      .onConflictDoNothing();

    const configurations = await getConfigurations();
    await localDb.delete(configurationTable);
    if (configurations.length > 0) {
      await localDb.insert(configurationTable).values(configurations);
    }

    await localDb
      .insert(federalStateLlmModelMappingTable)
      .values(await getFederalStateLlmModelMappings())
      .onConflictDoNothing();

    await insertDummyUser();
    await Promise.all([
      insertHelpModeGpt({ skip: false }),
      insertTemplateCharacters(),
      insertTemplateAssistant(),
      insertTemplateLearningScenarios(),
    ]);

    console.log('Database seeding from stage completed successfully!');
  } catch (error) {
    console.error('Error seeding database from stage:', error);
    throw error;
  }
}

try {
  await seedDatabase();
  console.log('Seeding completed');
  await pool.end();
} catch (error) {
  console.error('Seeding failed:', error);
  process.exit(1);
}
