import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiKeyExists: vi.fn(),
  dbGetFederalState: vi.fn(),
  dbUpdateFederalState: vi.fn(),
}));

vi.mock('@ais-chat/ai-core/api-keys/lookup', () => ({ apiKeyExists: mocks.apiKeyExists }));
vi.mock('@shared/db/functions/federal-state', () => ({
  dbDeleteFederalState: vi.fn(),
  dbGetFederalState: mocks.dbGetFederalState,
  dbGetFederalStates: vi.fn(),
  dbInsertFederalState: vi.fn(),
  dbUpdateFederalState: mocks.dbUpdateFederalState,
}));

import { NotFoundError } from '@shared/error';

import { getFederalStateById, updateFederalState } from './federal-state-service';

const federalState = {
  id: 'DE-TEST',
  encryptedApiKey: 'legacy-encrypted-key',
  apiKeyId: null,
};

describe('federal-state-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not expose the encrypted api key', async () => {
    mocks.dbGetFederalState.mockResolvedValue(federalState);

    const result = await getFederalStateById('DE-TEST');

    expect(result).not.toHaveProperty('encryptedApiKey');
  });

  it('updateFederalState stores a known api key id', async () => {
    const apiKeyId = 'a1b2c3d4-0000-4000-8000-000000000000';
    mocks.apiKeyExists.mockResolvedValue(true);
    mocks.dbUpdateFederalState.mockResolvedValue({ ...federalState, apiKeyId });

    const result = await updateFederalState({ id: 'DE-TEST', apiKeyId });

    expect(mocks.apiKeyExists).toHaveBeenCalledWith(apiKeyId);
    expect(mocks.dbUpdateFederalState).toHaveBeenCalledWith({ id: 'DE-TEST', apiKeyId });
    expect(result).toMatchObject({ id: 'DE-TEST', apiKeyId });
  });

  it('updateFederalState rejects unknown API keys', async () => {
    const apiKeyId = 'a1b2c3d4-0000-4000-8000-000000000000';
    mocks.apiKeyExists.mockResolvedValue(false);

    await expect(updateFederalState({ id: 'DE-TEST', apiKeyId })).rejects.toThrow(NotFoundError);
    expect(mocks.dbUpdateFederalState).not.toHaveBeenCalled();
  });
});
