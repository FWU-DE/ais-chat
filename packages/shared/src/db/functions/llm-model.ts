import { and, eq, getTableColumns, inArray } from 'drizzle-orm';
import { db } from '..';
import { federalStateLlmModelMappingTable, LlmModelSelectModel, llmModelTable } from '../schema';
import {
  dbGetFederalStateWithDecryptedApiKeyWithResult,
  dbGetFederalStates,
} from './federal-state';
import { fetchLlmModels } from '../../knotenpunkt';
import { logError } from '@shared/logging';

export async function dbGetLlmModelById({ modelId }: { modelId: string | undefined }) {
  if (modelId === undefined) return undefined;
  const [model] = await db
    .select()
    .from(llmModelTable)
    .where(eq(llmModelTable.id, modelId))
    .$withCache();
  return model;
}

export async function dbGetModelByName(name: string) {
  const [model] = await db
    .select()
    .from(llmModelTable)
    .where(eq(llmModelTable.name, name))
    .$withCache();
  return model;
}

export async function dbGetAllLlmModels() {
  return db.select().from(llmModelTable).orderBy(llmModelTable.createdAt).$withCache();
}

export async function dbGetSpeechModel() {
  const models = await dbGetAllLlmModels();
  return models.find((model) => model.priceMetadata.type === 'speech');
}

export async function dbGetLlmModelsByFederalStateId({
  federalStateId,
}: {
  federalStateId: string;
}): Promise<LlmModelSelectModel[]> {
  return db
    .select({ ...getTableColumns(llmModelTable) })
    .from(llmModelTable)
    .innerJoin(
      federalStateLlmModelMappingTable,
      eq(federalStateLlmModelMappingTable.llmModelId, llmModelTable.id),
    )
    .where(
      and(
        eq(federalStateLlmModelMappingTable.federalStateId, federalStateId),
        eq(llmModelTable.isDeleted, false),
      ),
    )
    .$withCache();
}

export async function dbFindModelByIdAndFederalStateId({
  modelId,
  federalStateId,
}: {
  modelId: string;
  federalStateId: string;
}) {
  const [model] = await db
    .select({ ...getTableColumns(llmModelTable) })
    .from(llmModelTable)
    .innerJoin(
      federalStateLlmModelMappingTable,
      eq(federalStateLlmModelMappingTable.llmModelId, llmModelTable.id),
    )
    .where(
      and(
        eq(llmModelTable.id, modelId),
        eq(federalStateLlmModelMappingTable.federalStateId, federalStateId),
        eq(llmModelTable.isDeleted, false),
      ),
    )
    .$withCache();
  return model;
}

export async function dbFindModelsToUpdate({
  federalStateId,
}: {
  federalStateId: string;
}): Promise<{ models: LlmModelSelectModel[]; modelIdsToAdd: string[]; modelsToRemove: string[] }> {
  const [error, result] = await dbGetFederalStateWithDecryptedApiKeyWithResult({ federalStateId });
  if (error !== null) {
    logError('Error getting federal state with decrypted API key', error, { federalStateId });
    return { models: [], modelIdsToAdd: [], modelsToRemove: [] };
  }
  // Fetch models from Knotenpunkt and load existing models in parallel
  const [models, existingModels] = await Promise.all([
    fetchLlmModels({ apiKey: result.decryptedApiKey }),
    dbGetLlmModelsByFederalStateId({ federalStateId }),
  ]);

  // Determine models to remove
  const modelsToRemove = existingModels
    .filter((existingModel) => !models.some((model) => model.id === existingModel.id))
    .map((model) => model.id);

  // Determine model ids to add to federal state (those that are not already associated)
  const existingModelIds = new Set(existingModels.map((model) => model.id));
  const modelIdsToAdd = models
    .filter((model) => !existingModelIds.has(model.id))
    .map((model) => model.id);

  return { models, modelIdsToAdd, modelsToRemove };
}

export async function dbUpdateLlmModelsForAllFederalStates() {
  const states = (await dbGetFederalStates()).filter((state) => state.encryptedApiKey !== null);

  const stateUpdates = await Promise.all(
    states.map(async (state) => {
      const { models, modelIdsToAdd, modelsToRemove } = await dbFindModelsToUpdate({
        federalStateId: state.id,
      });

      return {
        stateId: state.id,
        modelIdsToAdd,
        modelsToRemove,
        models,
      };
    }),
  );

  const modelsToUpsert = stateUpdates.flatMap(({ models }) => models);

  await dbUpsertLlmModels({ models: modelsToUpsert });

  await Promise.all(
    stateUpdates.map(async ({ stateId, modelIdsToAdd, modelsToRemove }) => {
      await dbUpsertFederalStateLlmModelMappings({
        federalStateId: stateId,
        modelIds: modelIdsToAdd,
      });
      await dbRemoveLlmModelsFromFederalState({
        federalStateId: stateId,
        modelIds: modelsToRemove,
      });
    }),
  );
}

export async function dbGetModelByIdAndFederalStateId({
  modelId,
  federalStateId,
}: {
  modelId: string;
  federalStateId: string;
}): Promise<LlmModelSelectModel | undefined> {
  const [result] = await db
    .select({ ...getTableColumns(llmModelTable) })
    .from(llmModelTable)
    .innerJoin(
      federalStateLlmModelMappingTable,
      eq(federalStateLlmModelMappingTable.llmModelId, llmModelTable.id),
    )
    .where(
      and(
        eq(llmModelTable.id, modelId),
        eq(federalStateLlmModelMappingTable.federalStateId, federalStateId),
      ),
    )
    .$withCache();

  return result;
}

async function dbUpsertLlmModels({ models }: { models: LlmModelSelectModel[] }) {
  // remove duplicates by id to avoid unnecessary upserts
  const uniqueModelsMap: Record<string, LlmModelSelectModel> = {};
  for (const model of models) {
    uniqueModelsMap[model.id] = model;
  }
  const uniqueModels = Object.values(uniqueModelsMap);
  for (const model of uniqueModels) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt: _createdAt, ...conflictSet } = model;
    await db.insert(llmModelTable).values(model).onConflictDoUpdate({
      target: llmModelTable.id,
      set: conflictSet,
    });
  }

  return uniqueModels;
}

async function dbUpsertFederalStateLlmModelMappings({
  federalStateId,
  modelIds,
}: {
  federalStateId: string;
  modelIds: string[];
}) {
  if (modelIds.length === 0) return;

  await db
    .insert(federalStateLlmModelMappingTable)
    .values(modelIds.map((llmModelId) => ({ federalStateId, llmModelId })))
    .onConflictDoNothing();
}

/**
 * Removes the association between specified LLM models and a federal state.
 *
 * This function deletes entries from the federal state LLM model mapping table
 * that match both the given federal state ID and any of the provided model IDs.
 * If no model IDs are provided, the function returns early without performing any deletion.
 *
 * @param params.federalStateId - The ID of the federal state to remove model associations from
 * @param params.modelIds - An array of LLM model IDs to disassociate from the federal state
 * @returns A promise that resolves when the deletion is complete
 *
 * @example
 * ```typescript
 * await dbRemoveLlmModelsFromFederalState({
 *   federalStateId: 'state-123',
 *   modelIds: ['model-1', 'model-2']
 * });
 * ```
 */
export async function dbRemoveLlmModelsFromFederalState({
  federalStateId,
  modelIds,
}: {
  federalStateId: string;
  modelIds: string[];
}) {
  if (modelIds.length === 0) return;

  await db
    .delete(federalStateLlmModelMappingTable)
    .where(
      and(
        eq(federalStateLlmModelMappingTable.federalStateId, federalStateId),
        inArray(federalStateLlmModelMappingTable.llmModelId, modelIds),
      ),
    );
}
