import { getProjectsWithApiKey } from '@ais-chat/ai-core/api-keys/projects';

import { db } from '..';
import {
  federalStateFeatureTogglesSchema,
  FederalStateInsertModel,
  federalStateTable,
} from '../schema';

const ALL_FEATURE_TOGGLES_ENABLED = federalStateFeatureTogglesSchema.parse({
  ...Object.fromEntries(
    Object.keys(federalStateFeatureTogglesSchema.shape)
      .filter((key) => key !== 'anonymizationMode')
      .map((key) => [key, true]),
  ),
  // Anonymization depends on an external Presidio service, so it stays opt-in.
  isAnonymizationEnabled: false,
});

export async function insertFederalStates({ skip = true }: { skip: boolean }) {
  if (skip) return;

  const projects = await getProjectsWithApiKey();
  if (projects.length === 0) {
    throw new Error(
      'No projects with an api key found in the API database. Run the api seed first (pnpm db:seed).',
    );
  }

  for (const { projectId, apiKeyId } of projects) {
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

  console.log('federalState seed successful');
}
