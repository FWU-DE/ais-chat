import { getProjectsWithActiveApiKey } from '@ais-chat/ai-core/api-keys/projects';

import { db } from '..';
import { dbUpdateLlmModelsForAllFederalStates } from '../functions/llm-model';
import {
  federalStateFeatureTogglesSchema,
  FederalStateInsertModel,
  federalStateTable,
} from '../schema';

const ALL_FEATURE_TOGGLES_ENABLED = federalStateFeatureTogglesSchema.parse(
  Object.fromEntries(Object.keys(federalStateFeatureTogglesSchema.shape).map((key) => [key, true])),
);

export async function insertFederalStates({ skip = true }: { skip: boolean }) {
  if (skip) return;

  const projects = await getProjectsWithActiveApiKey();
  if (projects.length === 0) {
    throw new Error(
      'No projects found in the API database. Run the api seed first (pnpm db:seed).',
    );
  }

  for (const { projectId, apiKeyId } of projects) {
    if (apiKeyId === undefined) {
      console.log(`Skipping federal state ${projectId}: project has no active api key`);
      continue;
    }

    const federalState = {
      id: projectId,
      studentPriceLimit: 200,
      teacherPriceLimit: 500,
      apiKeyId,
      featureToggles: ALL_FEATURE_TOGGLES_ENABLED,
    } satisfies FederalStateInsertModel;

    await db
      .insert(federalStateTable)
      .values(federalState)
      .onConflictDoUpdate({
        target: federalStateTable.id,
        set: { apiKeyId, featureToggles: ALL_FEATURE_TOGGLES_ENABLED },
      });
  }

  await dbUpdateLlmModelsForAllFederalStates();

  console.log('federalState seed successful');
}
