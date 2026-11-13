'use server';
import { runServerAction } from '@shared/actions/run-server-action';
import {
  federalStateFeatureTogglesSchema,
  FederalStateInsertModel,
  FederalStateUpdateModel,
} from '@shared/db/schema';
import {
  createFederalState,
  deleteFederalState,
  getFederalStateById,
  updateFederalState,
} from '@shared/federal-states/federal-state-service';

import { requireAdminAuth } from '@/auth/requireAdminAuth';
import { runDeleteOrThrowError } from '@/utils/run-delete-or-throw-error';

export async function getFederalStateByIdAction(federalStateId: string) {
  await requireAdminAuth();

  return getFederalStateById(federalStateId);
}

export async function createFederalStateAction(
  data: Omit<FederalStateInsertModel, 'createdAt' | 'featureToggles' | 'encryptedApiKey'>,
) {
  await requireAdminAuth();

  return createFederalState({
    ...data,
    featureToggles: federalStateFeatureTogglesSchema.parse({}),
  });
}

export async function updateFederalStateAction(data: FederalStateUpdateModel) {
  await requireAdminAuth();

  return updateFederalState(data);
}

export async function deleteFederalStateAction(federalStateId: string) {
  await requireAdminAuth();
  return runServerAction('deleteFederalStateAction', (id: string) =>
    runDeleteOrThrowError(
      () => deleteFederalState(id),
      'Bundesland kann nicht gelöscht werden, da noch Daten damit verknüpft sind.',
    ),
  )(federalStateId);
}
