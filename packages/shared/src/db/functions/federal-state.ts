import { eq } from 'drizzle-orm';

import { errorifyAsyncFn } from '../../utils/error';
import { db } from '..';
import {
  FederalStateInsertModel,
  FederalStateSelectModel,
  federalStateTable,
  FederalStateUpdateModel,
} from '../schema';

export const dbGetFederalStateWithApiKeyIdWithResult = errorifyAsyncFn(
  dbGetFederalStateWithApiKeyId,
);
export async function dbGetFederalStateWithApiKeyId({
  federalStateId,
}: {
  federalStateId: string | undefined;
}) {
  if (federalStateId === undefined) {
    throw new Error('No federal state id given');
  }

  const [federalState] = await db
    .select()
    .from(federalStateTable)
    .where(eq(federalStateTable.id, federalStateId))
    .$withCache();

  if (federalState === undefined) {
    throw new Error(`Could not find federal state with id ${federalStateId}`);
  }

  if (federalState.apiKeyId === null) {
    throw new Error(`Federal state ${federalState.id} has no api key attached`);
  }

  return { ...federalState, apiKeyId: federalState.apiKeyId };
}

export async function dbGetFederalStates(): Promise<FederalStateSelectModel[]> {
  return db.select().from(federalStateTable).$withCache();
}

// TODO: We have two functions for getting federal state by id
export async function dbGetFederalState(id: string): Promise<FederalStateSelectModel> {
  const [federalState] = await db
    .select()
    .from(federalStateTable)
    .where(eq(federalStateTable.id, id))
    .$withCache();

  if (!federalState) {
    throw new Error(`Federal state with id ${id} not found`);
  }
  return federalState;
}

export const dbGetFederalStateByIdWithResult = errorifyAsyncFn(dbGetFederalStateById);
export async function dbGetFederalStateById(id: string | undefined) {
  if (id === undefined) {
    return undefined;
  }
  const [federalState] = await db
    .select()
    .from(federalStateTable)
    .where(eq(federalStateTable.id, id))
    .$withCache();

  return federalState;
}

export async function dbInsertFederalState(federalState: FederalStateInsertModel) {
  const [inserted] = await db.insert(federalStateTable).values(federalState).returning();

  return inserted;
}

export async function dbUpdateFederalState(federalState: FederalStateUpdateModel) {
  const [updated] = await db
    .update(federalStateTable)
    .set(federalState)
    .where(eq(federalStateTable.id, federalState.id))
    .returning();

  if (!updated) {
    throw new Error(`Failed to update federal state with id ${federalState.id}`);
  }

  return updated;
}

export async function dbDeleteFederalState(id: string) {
  if (!id) {
    throw new Error('No federal state id given');
  }
  const [deleted] = await db
    .delete(federalStateTable)
    .where(eq(federalStateTable.id, id))
    .returning();
  return deleted;
}
