import { dbValidateApiKeyById } from '@ais-chat/api-database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiModel } from '../images/types';
import { assertApiKeyCanUseModel } from './access';
import { isApiKeyOverQuota } from './billing';
import { hasAccessToModel } from './model-access';

vi.mock('@ais-chat/api-database', () => ({
  dbValidateApiKeyById: vi.fn(),
}));

vi.mock('./billing', () => ({
  isApiKeyOverQuota: vi.fn(),
}));

vi.mock('./model-access', () => ({
  hasAccessToModel: vi.fn(),
}));

const mockDbValidateApiKeyById = vi.mocked(dbValidateApiKeyById);
const mockIsApiKeyOverQuota = vi.mocked(isApiKeyOverQuota);
const mockHasAccessToModel = vi.mocked(hasAccessToModel);

const model = { id: 'model-1', name: 'test-model' } as AiModel;

describe('assertApiKeyCanUseModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbValidateApiKeyById.mockResolvedValue({ valid: true, apiKey: {} as never });
    mockHasAccessToModel.mockResolvedValue(true);
    mockIsApiKeyOverQuota.mockResolvedValue(false);
  });

  it('resolves when the key is usable, has access and is within quota', async () => {
    await expect(assertApiKeyCanUseModel('key-1', model, 'text')).resolves.toBeUndefined();

    expect(mockDbValidateApiKeyById).toHaveBeenCalledWith('key-1');
    expect(mockHasAccessToModel).toHaveBeenCalledWith('key-1', model);
    expect(mockIsApiKeyOverQuota).toHaveBeenCalledWith('key-1');
  });

  it('runs all checks in parallel', async () => {
    let resolveAccess!: (value: boolean) => void;
    let resolveQuota!: (value: boolean) => void;
    let resolveValidation!: (value: { valid: true; apiKey: never }) => void;
    mockHasAccessToModel.mockReturnValue(new Promise((resolve) => (resolveAccess = resolve)));
    mockIsApiKeyOverQuota.mockReturnValue(new Promise((resolve) => (resolveQuota = resolve)));
    mockDbValidateApiKeyById.mockReturnValue(
      new Promise((resolve) => (resolveValidation = resolve)),
    );

    const result = assertApiKeyCanUseModel('key-1', model, 'text');
    await Promise.resolve();

    expect(mockHasAccessToModel).toHaveBeenCalledTimes(1);
    expect(mockIsApiKeyOverQuota).toHaveBeenCalledTimes(1);
    expect(mockDbValidateApiKeyById).toHaveBeenCalledTimes(1);

    resolveAccess(true);
    resolveQuota(false);
    resolveValidation({ valid: true, apiKey: {} as never });
    await expect(result).resolves.toBeUndefined();
  });

  it.each(['text', 'embedding', 'image'] as const)(
    'names the %s model kind when access is denied',
    async (kind) => {
      mockHasAccessToModel.mockResolvedValue(false);

      await expect(assertApiKeyCanUseModel('key-1', model, kind)).rejects.toThrow(
        `API key does not have access to the ${kind} model: test-model`,
      );
    },
  );

  it('throws when the monthly quota is exceeded', async () => {
    mockIsApiKeyOverQuota.mockResolvedValue(true);

    await expect(assertApiKeyCanUseModel('key-1', model, 'text')).rejects.toThrow(
      'API key has exceeded its monthly quota',
    );
  });

  it('throws ApiKeyUnusableError with the reason when the key is not usable', async () => {
    mockDbValidateApiKeyById.mockResolvedValue({ valid: false, reason: 'Api key is expired' });

    await expect(assertApiKeyCanUseModel('key-1', model, 'text')).rejects.toMatchObject({
      name: 'ApiKeyUnusableError',
      reason: 'Api key is expired',
    });
  });

  it('reports an unusable key before missing access or exceeded quota', async () => {
    mockDbValidateApiKeyById.mockResolvedValue({ valid: false, reason: 'Api key was deleted' });
    mockHasAccessToModel.mockResolvedValue(false);
    mockIsApiKeyOverQuota.mockResolvedValue(true);

    await expect(assertApiKeyCanUseModel('key-1', model, 'text')).rejects.toMatchObject({
      name: 'ApiKeyUnusableError',
    });
  });
});
