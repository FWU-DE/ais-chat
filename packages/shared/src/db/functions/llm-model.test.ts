import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: { dbCacheTtlSeconds: undefined as number | undefined },
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
vi.mock('../env', () => ({ env: mocks.env }));
vi.mock('./federal-state', () => ({ dbGetFederalStateById: mocks.dbGetFederalStateById }));

const activeModel = { id: 'model-active', isDeleted: false, priceMetadata: { type: 'text' } };
const deletedModel = { id: 'model-deleted', isDeleted: true, priceMetadata: { type: 'text' } };
const speechModel = { id: 'model-speech', isDeleted: false, priceMetadata: { type: 'speech' } };

async function importLlmModelFunctions() {
  // Fresh module per test so the in-process catalog cache starts empty
  vi.resetModules();
  return import('./llm-model');
}

describe('llm-model catalog access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.env.dbCacheTtlSeconds = undefined;
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

  describe('caching', () => {
    it('does not cache when no TTL is configured', async () => {
      const { dbGetLlmModelsByFederalStateId } = await importLlmModelFunctions();

      await dbGetLlmModelsByFederalStateId({ federalStateId: 'DE-TEST' });
      await dbGetLlmModelsByFederalStateId({ federalStateId: 'DE-TEST' });

      expect(mocks.getCatalogModelsByApiKeyId).toHaveBeenCalledTimes(2);
    });

    it('serves cached results until the TTL expires', async () => {
      vi.useFakeTimers();
      mocks.env.dbCacheTtlSeconds = 60;
      const { dbGetLlmModelsByFederalStateId } = await importLlmModelFunctions();

      await dbGetLlmModelsByFederalStateId({ federalStateId: 'DE-TEST' });
      await dbGetLlmModelsByFederalStateId({ federalStateId: 'DE-TEST' });
      expect(mocks.getCatalogModelsByApiKeyId).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60_001);
      await dbGetLlmModelsByFederalStateId({ federalStateId: 'DE-TEST' });
      expect(mocks.getCatalogModelsByApiKeyId).toHaveBeenCalledTimes(2);
    });

    it('does not cache failed catalog reads', async () => {
      mocks.env.dbCacheTtlSeconds = 60;
      mocks.getCatalogModelsByApiKeyId.mockRejectedValueOnce(new Error('db down'));
      const { dbGetLlmModelsByFederalStateId } = await importLlmModelFunctions();

      await expect(dbGetLlmModelsByFederalStateId({ federalStateId: 'DE-TEST' })).rejects.toThrow(
        'db down',
      );
      await expect(dbGetLlmModelsByFederalStateId({ federalStateId: 'DE-TEST' })).resolves.toEqual([
        activeModel,
      ]);
    });
  });
});
