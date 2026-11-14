import { apiKeyExists } from '@ais-chat/ai-core/api-keys/lookup';
import {
  dbDeleteFederalState,
  dbGetFederalState,
  dbGetFederalStates,
  dbInsertFederalState,
  dbUpdateFederalState,
} from '@shared/db/functions/federal-state';
import {
  FederalStateInsertModel,
  FederalStateSelectModel,
  FederalStateUpdateModel,
  federalStateUpdateSchema,
} from '@shared/db/schema';
import { NotFoundError } from '@shared/error';
import { FederalStateModel } from '@shared/federal-states/types';

export async function getFederalStates(): Promise<FederalStateModel[]> {
  const federalStates = await dbGetFederalStates();
  return federalStates.map((federalState) => {
    return transformToModel(federalState);
  });
}

export async function getFederalStateById(federalStateId: string): Promise<FederalStateModel> {
  const federalState = await dbGetFederalState(federalStateId);
  return transformToModel(federalState);
}

const updateSchema = federalStateUpdateSchema.omit({
  encryptedApiKey: true,
});

export async function updateFederalState(
  federalState: Omit<FederalStateUpdateModel, 'encryptedApiKey' | 'createdAt'>,
): Promise<FederalStateModel> {
  const values = updateSchema.parse(federalState);
  const updated = await dbUpdateFederalState(values);
  return transformToModel(updated);
}

export async function updateApiKeyId(
  federalStateId: string,
  apiKeyId: string,
): Promise<FederalStateModel> {
  if (!(await apiKeyExists(apiKeyId))) {
    throw new NotFoundError(`API key ${apiKeyId} not found`);
  }

  const updated = await dbUpdateFederalState({
    id: federalStateId,
    apiKeyId,
  });

  if (!updated) {
    throw new Error(`Failed to update federal state with id ${federalStateId}`);
  }
  return transformToModel(updated);
}

export async function createFederalState(
  data: Omit<FederalStateInsertModel, 'createdAt'>,
): Promise<FederalStateModel> {
  const inserted = await dbInsertFederalState(data);
  if (!inserted) {
    throw new Error('Failed to create federal state');
  }
  return transformToModel(inserted);
}

export async function deleteFederalState(federalStateId: string): Promise<void> {
  const deleted = await dbDeleteFederalState(federalStateId);
  if (!deleted) {
    throw new Error(`Failed to delete federal state with id ${federalStateId}`);
  }
}

function transformToModel(federalState: FederalStateSelectModel): FederalStateModel {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { encryptedApiKey, ...federalStateWithoutApiKey } = federalState;

  return {
    ...federalStateWithoutApiKey,
    hasApiKeyAssigned: !!federalState.apiKeyId,
  };
}
