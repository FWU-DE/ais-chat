import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAllLlmModels: vi.fn(),
  getLlmModelById: vi.fn(),
  getLlmModelByName: vi.fn(),
  getLlmModelsByApiKeyId: vi.fn(),
  dbGetFederalStateById: vi.fn(),
}));

vi.mock('@ais-chat/ai-core/models/llm-models', () => ({
  getAllLlmModels: mocks.getAllLlmModels,
  getLlmModelById: mocks.getLlmModelById,
  getLlmModelByName: mocks.getLlmModelByName,
  getLlmModelsByApiKeyId: mocks.getLlmModelsByApiKeyId,
}));
vi.mock('./federal-state', () => ({ dbGetFederalStateById: mocks.dbGetFederalStateById }));

const activeModel = { id: 'model-active', isDeleted: false, priceMetadata: { type: 'text' } };
const deletedModel = { id: 'model-deleted', isDeleted: true, priceMetadata: { type: 'text' } };
const speechModel = { id: 'model-speech', isDeleted: false, priceMetadata: { type: 'speech' } };

async function importLlmModelFunctions() {
  return import('./llm-model');
}

describe('llm-model access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbGetFederalStateById.mockResolvedValue({ id: 'DE-TEST', apiKeyId: 'api-key-1' });
    mocks.getLlmModelsByApiKeyId.mockResolvedValue([activeModel, deletedModel]);
  });

  describe('dbGetLlmModelsByFederalStateId', () => {
    it('returns the non-deleted models of the federal state API key', async () => {
      const { dbGetLlmModelsByFederalStateId } = await importLlmModelFunctions();

      const models = await dbGetLlmModelsByFederalStateId({ federalStateId: 'DE-TEST' });

      expect(mocks.dbGetFederalStateById).toHaveBeenCalledWith('DE-TEST');
      expect(mocks.getLlmModelsByApiKeyId).toHaveBeenCalledWith('api-key-1');
      expect(models).toEqual([activeModel]);
    });

    it.each([{ federalState: undefined }, { federalState: { id: 'DE-TEST', apiKeyId: null } }])(
      'returns no models without an assigned API key ($federalState)',
      async ({ federalState }) => {
        mocks.dbGetFederalStateById.mockResolvedValue(federalState);
        const { dbGetLlmModelsByFederalStateId } = await importLlmModelFunctions();

        const models = await dbGetLlmModelsByFederalStateId({ federalStateId: 'DE-TEST' });

        expect(models).toEqual([]);
        expect(mocks.getLlmModelsByApiKeyId).not.toHaveBeenCalled();
      },
    );
  });

  describe('dbFindModelByIdAndFederalStateId', () => {
    it('finds an accessible non-deleted model', async () => {
      const { dbFindModelByIdAndFederalStateId } = await importLlmModelFunctions();

      await expect(
        dbFindModelByIdAndFederalStateId({ modelId: 'model-active', federalStateId: 'DE-TEST' }),
      ).resolves.toEqual(activeModel);
    });

    it('does not return deleted models', async () => {
      const { dbFindModelByIdAndFederalStateId } = await importLlmModelFunctions();

      await expect(
        dbFindModelByIdAndFederalStateId({ modelId: 'model-deleted', federalStateId: 'DE-TEST' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('global lookups', () => {
    it('reads a model by id', async () => {
      mocks.getLlmModelById.mockResolvedValue(activeModel);
      const { dbGetLlmModelById } = await importLlmModelFunctions();

      await expect(dbGetLlmModelById({ modelId: 'model-active' })).resolves.toEqual(activeModel);
      expect(mocks.getLlmModelById).toHaveBeenCalledWith('model-active');
    });

    it('returns undefined without querying when no model id is given', async () => {
      const { dbGetLlmModelById } = await importLlmModelFunctions();

      await expect(dbGetLlmModelById({ modelId: undefined })).resolves.toBeUndefined();
      expect(mocks.getLlmModelById).not.toHaveBeenCalled();
    });

    it('reads a model by name', async () => {
      mocks.getLlmModelByName.mockResolvedValue(activeModel);
      const { dbGetModelByName } = await importLlmModelFunctions();

      await expect(dbGetModelByName('model-name')).resolves.toEqual(activeModel);
      expect(mocks.getLlmModelByName).toHaveBeenCalledWith('model-name');
    });

    it('finds the non-deleted speech model', async () => {
      mocks.getAllLlmModels.mockResolvedValue([
        { ...speechModel, id: 'deleted-speech', isDeleted: true },
        activeModel,
        speechModel,
      ]);
      const { dbGetSpeechModel } = await importLlmModelFunctions();

      await expect(dbGetSpeechModel()).resolves.toEqual(speechModel);
    });
  });
});
