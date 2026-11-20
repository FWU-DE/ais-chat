import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbRefreshEntityPopularity: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock('@shared/db/functions/popularity', () => ({
  dbRefreshEntityPopularity: mocks.dbRefreshEntityPopularity,
}));

vi.mock('@shared/logging', () => ({
  logInfo: mocks.logInfo,
}));

import { refreshEntityPopularity } from './popularity-service';

describe('refreshEntityPopularity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the updated counts per entity type and the duration', async () => {
    mocks.dbRefreshEntityPopularity.mockResolvedValue({
      assistantsUpdated: 1,
      charactersUpdated: 2,
      learningScenariosUpdated: 3,
    });

    const result = await refreshEntityPopularity();

    expect(result).toEqual({
      assistantsUpdated: 1,
      charactersUpdated: 2,
      learningScenariosUpdated: 3,
      durationMs: expect.any(Number),
    });
  });

  it('propagates errors of the db function', async () => {
    mocks.dbRefreshEntityPopularity.mockRejectedValue(new Error('db failed'));

    await expect(refreshEntityPopularity()).rejects.toThrow('db failed');
  });
});
