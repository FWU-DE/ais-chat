import {
  FederalStateSelectModel,
  FederalStateUpdateModel,
  FederalStateInsertModel,
  federalStateUpdateSchema,
} from '@shared/db/schema';
import {
  dbGetFederalState,
  dbGetFederalStates,
  dbUpdateFederalState,
  dbInsertFederalState,
  dbDeleteFederalState,
} from '@shared/db/functions/federal-state';
import { FederalStateModel } from '@shared/federal-states/types';
import { encrypt } from '@shared/db/crypto';
import { env } from '@shared/env';

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

export async function updateApiKey(
  federalStateId: string,
  decryptedApiKey: string,
): Promise<FederalStateModel> {
  const apiKey = encrypt({
    text: decryptedApiKey,
    plainEncryptionKey: env.encryptionKey,
  });

  const updated = await dbUpdateFederalState({
    id: federalStateId,
    encryptedApiKey: apiKey,
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
    hasApiKeyAssigned: !!federalState.encryptedApiKey,
  };
}
