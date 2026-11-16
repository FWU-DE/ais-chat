import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAllCatalogModels: vi.fn(),
  getCatalogModelById: vi.fn(),
  getCatalogModelByName: vi.fn(),
  getCatalogModelsByApiKeyId: vi.fn(),
  dbGetFederalStateById: vi.fn(),
}));

vi.mock('@ais-chat/ai-core/models/catalog', () => ({
  getAllCatalogModels: mocks.getAllCatalogModels,
  getCatalogModelById: mocks.getCatalogModelById,
  getCatalogModelByName: mocks.getCatalogModelByName,
  getCatalogModelsByApiKeyId: mocks.getCatalogModelsByApiKeyId,
}));
vi.mock('./federal-state', () => ({ dbGetFederalStateById: mocks.dbGetFederalStateById }));

const activeModel = { id: 'model-active', isDeleted: false, priceMetadata: { type: 'text' } };
const deletedModel = { id: 'model-deleted', isDeleted: true, priceMetadata: { type: 'text' } };
const speechModel = { id: 'model-speech', isDeleted: false, priceMetadata: { type: 'speech' } };

async function importLlmModelFunctions() {
  return import('./llm-model');
}

describe('llm-model catalog access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbGetFederalStateById.mockResolvedValue({ id: 'DE-TEST', apiKeyId: 'api-key-1' });
    mocks.getCatalogModelsByApiKeyId.mockResolvedValue([activeModel, deletedModel]);
  });

  describe('dbGetLlmModelsByFederalStateId', () => {
    it('returns the non-deleted models of the federal state API key', async () => {
      const { dbGetLlmModelsByFederalStateId } = await importLlmModelFunctions();

      const models = await dbGetLlmModelsByFederalStateId({ federalStateId: 'DE-TEST' });

      expect(mocks.dbGetFederalStateById).toHaveBeenCalledWith('DE-TEST');
      expect(mocks.getCatalogModelsByApiKeyId).toHaveBeenCalledWith('api-key-1');
      expect(models).toEqual([activeModel]);
    });

    it.each([{ federalState: undefined }, { federalState: { id: 'DE-TEST', apiKeyId: null } }])(
      'returns no models without an assigned API key ($federalState)',
      async ({ federalState }) => {
        mocks.dbGetFederalStateById.mockResolvedValue(federalState);
        const { dbGetLlmModelsByFederalStateId } = await importLlmModelFunctions();

        const models = await dbGetLlmModelsByFederalStateId({ federalStateId: 'DE-TEST' });

        expect(models).toEqual([]);
        expect(mocks.getCatalogModelsByApiKeyId).not.toHaveBeenCalled();
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

  describe('dbGetModelByIdAndFederalStateId', () => {
    it('returns deleted models the API key still has access to', async () => {
      const { dbGetModelByIdAndFederalStateId } = await importLlmModelFunctions();

      await expect(
        dbGetModelByIdAndFederalStateId({ modelId: 'model-deleted', federalStateId: 'DE-TEST' }),
      ).resolves.toEqual(deletedModel);
    });

    it('returns undefined for models outside the API key', async () => {
      const { dbGetModelByIdAndFederalStateId } = await importLlmModelFunctions();

      await expect(
        dbGetModelByIdAndFederalStateId({ modelId: 'model-other', federalStateId: 'DE-TEST' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('global lookups', () => {
    it('reads a model by id from the catalog', async () => {
      mocks.getCatalogModelById.mockResolvedValue(activeModel);
      const { dbGetLlmModelById } = await importLlmModelFunctions();

      await expect(dbGetLlmModelById({ modelId: 'model-active' })).resolves.toEqual(activeModel);
      expect(mocks.getCatalogModelById).toHaveBeenCalledWith('model-active');
    });

    it('returns undefined without querying when no model id is given', async () => {
      const { dbGetLlmModelById } = await importLlmModelFunctions();

      await expect(dbGetLlmModelById({ modelId: undefined })).resolves.toBeUndefined();
      expect(mocks.getCatalogModelById).not.toHaveBeenCalled();
    });

    it('reads a model by name from the catalog', async () => {
      mocks.getCatalogModelByName.mockResolvedValue(activeModel);
      const { dbGetModelByName } = await importLlmModelFunctions();

      await expect(dbGetModelByName('model-name')).resolves.toEqual(activeModel);
      expect(mocks.getCatalogModelByName).toHaveBeenCalledWith('model-name');
    });

    it('finds the non-deleted speech model', async () => {
      mocks.getAllCatalogModels.mockResolvedValue([
        { ...speechModel, id: 'deleted-speech', isDeleted: true },
        activeModel,
        speechModel,
      ]);
      const { dbGetSpeechModel } = await importLlmModelFunctions();

      await expect(dbGetSpeechModel()).resolves.toEqual(speechModel);
    });
  });
});
