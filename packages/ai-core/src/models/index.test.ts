import {
  dbGetDirectModelConfiguration,
  dbGetModelById,
  dbGetModelByNameAndApiKeyId,
} from '@ais-chat/api-database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getEmbeddingModelById,
  getEmbeddingModelByName,
  getImageModelById,
  getImageModelByName,
  getSafetyModelById,
  getSafetyModelByName,
  getSpeechModelById,
  getSpeechModelByName,
  getTextModelById,
  getTextModelByName,
} from './index';

vi.mock('@ais-chat/api-database', () => ({
  dbGetModelById: vi.fn(),
  dbGetModelByNameAndApiKeyId: vi.fn(),
  dbGetDirectModelConfiguration: vi.fn(),
}));

const mockDbGetModelById = vi.mocked(dbGetModelById);
const mockDbGetModelByNameAndApiKeyId = vi.mocked(dbGetModelByNameAndApiKeyId);
const mockDbGetDirectModelConfiguration = vi.mocked(dbGetDirectModelConfiguration);

beforeEach(() => {
  vi.resetAllMocks();
});

describe.each([
  { type: 'text', byId: getTextModelById, byName: getTextModelByName },
  { type: 'image', byId: getImageModelById, byName: getImageModelByName },
  { type: 'embedding', byId: getEmbeddingModelById, byName: getEmbeddingModelByName },
  { type: 'safety', byId: getSafetyModelById, byName: getSafetyModelByName },
  { type: 'speech', byId: getSpeechModelById, byName: getSpeechModelByName },
])('$type model lookups', ({ type, byId, byName }) => {
  const model = {
    id: 'model-123',
    name: 'test-model',
    provider: 'bifrost',
    useBifrost: true,
    priceMetadata: { type },
  };

  it('returns a matching model by ID', async () => {
    mockDbGetModelById.mockResolvedValue(model as never);

    await expect(byId(model.id)).resolves.toEqual(model);
    expect(mockDbGetModelById).toHaveBeenCalledWith(model.id);
    expect(mockDbGetDirectModelConfiguration).not.toHaveBeenCalled();
  });

  it('returns a matching model by name for the API key', async () => {
    mockDbGetModelByNameAndApiKeyId.mockResolvedValue(model as never);

    await expect(byName(model.name, 'api-key')).resolves.toEqual(model);
    expect(mockDbGetModelByNameAndApiKeyId).toHaveBeenCalledWith({
      name: model.name,
      apiKeyId: 'api-key',
    });
    expect(mockDbGetDirectModelConfiguration).not.toHaveBeenCalled();
  });

  it('rejects a missing model by ID', async () => {
    mockDbGetModelById.mockResolvedValue(null as never);

    await expect(byId(model.id)).rejects.toThrow(`Model with id ${model.id} not found`);
  });

  it('rejects a missing model by name', async () => {
    mockDbGetModelByNameAndApiKeyId.mockResolvedValue(null as never);

    await expect(byName(model.name, 'api-key')).rejects.toThrow(
      `No ${type} model with name ${model.name} found for this API key`,
    );
  });

  it('rejects an incorrectly typed model by ID', async () => {
    mockDbGetModelById.mockResolvedValue({
      ...model,
      priceMetadata: { type: type === 'text' ? 'image' : 'text' },
    } as never);

    await expect(byId(model.id)).rejects.toThrow(
      `Model with id ${model.id} is not of type ${type}`,
    );
    expect(mockDbGetDirectModelConfiguration).not.toHaveBeenCalled();
  });

  it('rejects an incorrectly typed model by name', async () => {
    mockDbGetModelByNameAndApiKeyId.mockResolvedValue({
      ...model,
      priceMetadata: { type: type === 'text' ? 'image' : 'text' },
    } as never);

    await expect(byName(model.name, 'api-key')).rejects.toThrow(
      `Model ${model.name} is not of type ${type}`,
    );
    expect(mockDbGetDirectModelConfiguration).not.toHaveBeenCalled();
  });

  it('resolves direct routing by ID when Bifrost is disabled', async () => {
    const directModel = { ...model, provider: 'openai', useBifrost: false };
    mockDbGetModelById.mockResolvedValue({ ...model, useBifrost: false } as never);
    mockDbGetDirectModelConfiguration.mockResolvedValue(directModel as never);

    await expect(byId(model.id)).resolves.toEqual(directModel);
    expect(mockDbGetDirectModelConfiguration).toHaveBeenCalledWith(model.id);
  });

  it('resolves direct routing by name when Bifrost is disabled', async () => {
    const directModel = { ...model, provider: 'openai', useBifrost: false };
    mockDbGetModelByNameAndApiKeyId.mockResolvedValue({ ...model, useBifrost: false } as never);
    mockDbGetDirectModelConfiguration.mockResolvedValue(directModel as never);

    await expect(byName(model.name, 'api-key')).resolves.toEqual(directModel);
    expect(mockDbGetDirectModelConfiguration).toHaveBeenCalledWith(model.id);
  });

  it('rejects missing direct routing configuration', async () => {
    mockDbGetModelById.mockResolvedValue({ ...model, useBifrost: false } as never);
    mockDbGetDirectModelConfiguration.mockResolvedValue(undefined);

    await expect(byId(model.id)).rejects.toThrow(
      `Model ${model.id} requires exactly one enabled provider key when Bifrost is disabled`,
    );
  });
});
