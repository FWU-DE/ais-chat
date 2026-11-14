import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  dbGetAllApiKeys: vi.fn(),
  updateApiKeyId: vi.fn(),
}));

vi.mock('@/auth/requireAdminAuth', () => ({ requireAdminAuth: mocks.requireAdminAuth }));
vi.mock('@ais-chat/api-database', () => ({ dbGetAllApiKeys: mocks.dbGetAllApiKeys }));
vi.mock('@shared/federal-states/federal-state-service', () => ({
  updateApiKeyId: mocks.updateApiKeyId,
}));

import { getApiKeyOptionsAction, updateApiKeyIdAction } from './actions';

const apiKeyId = 'a1b2c3d4-0000-4000-8000-000000000000';

describe('getApiKeyOptionsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the API key options for admins', async () => {
    const apiKeys = [{ id: apiKeyId, name: 'key', projectName: 'project' }];
    mocks.requireAdminAuth.mockResolvedValue(undefined);
    mocks.dbGetAllApiKeys.mockResolvedValue(apiKeys);

    await expect(getApiKeyOptionsAction()).resolves.toEqual(apiKeys);
  });

  it('does not read API keys without admin authorization', async () => {
    mocks.requireAdminAuth.mockRejectedValue(new Error('forbidden'));

    await expect(getApiKeyOptionsAction()).rejects.toThrow('forbidden');
    expect(mocks.dbGetAllApiKeys).not.toHaveBeenCalled();
  });
});

describe('updateApiKeyIdAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAuth.mockResolvedValue(undefined);
  });

  it('assigns the API key to the federal state', async () => {
    mocks.updateApiKeyId.mockResolvedValue({ id: 'DE-TEST', apiKeyId });

    await expect(updateApiKeyIdAction('DE-TEST', apiKeyId)).resolves.toEqual({
      id: 'DE-TEST',
      apiKeyId,
    });
    expect(mocks.updateApiKeyId).toHaveBeenCalledWith('DE-TEST', apiKeyId);
  });

  it('requires admin authorization', async () => {
    mocks.requireAdminAuth.mockRejectedValue(new Error('forbidden'));

    await expect(updateApiKeyIdAction('DE-TEST', apiKeyId)).rejects.toThrow('forbidden');
    expect(mocks.updateApiKeyId).not.toHaveBeenCalled();
  });

  it('rejects ids that are not UUIDs', async () => {
    await expect(updateApiKeyIdAction('DE-TEST', 'not-a-uuid')).rejects.toThrow();
    expect(mocks.updateApiKeyId).not.toHaveBeenCalled();
  });
});
