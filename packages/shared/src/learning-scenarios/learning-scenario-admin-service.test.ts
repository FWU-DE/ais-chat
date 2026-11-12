import { dbGetLearningScenarioById } from '@shared/db/functions/learning-scenario';
import { NotFoundError } from '@shared/error';
import { copyEntityPictureIfExists } from '@shared/templates/template-service';
import { describe, expect, it, vi } from 'vitest';

import { duplicateLearningScenario } from './learning-scenario-admin-service';

const { mockDbInsert, mockDbInsertValues, mockDbReturning } = vi.hoisted(() => {
  const mockDbReturning = vi.fn();
  const mockDbInsertValues = vi.fn(() => ({ returning: mockDbReturning }));
  const mockDbInsert = vi.fn(() => ({ values: mockDbInsertValues }));

  return { mockDbInsert, mockDbInsertValues, mockDbReturning };
});

vi.mock('@shared/db', () => ({ db: { insert: mockDbInsert } }));

vi.mock('@shared/db/functions/learning-scenario', () => ({
  dbGetLearningScenarioById: vi.fn(),
}));

vi.mock('@shared/templates/template-service', () => ({
  copyEntityPictureIfExists: vi.fn(),
  copyRelatedTemplateFiles: vi.fn(),
}));

describe('duplicateLearningScenario', () => {
  it('should copy licenseInformation and didacticCommentary to the duplicated learning scenario', async () => {
    const sourceLearningScenario = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Original scenario',
      modelId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      licenseInformation: 'Scenario license',
      didacticCommentary: 'Scenario teaching notes',
    };

    vi.mocked(dbGetLearningScenarioById).mockResolvedValue(sourceLearningScenario as never);
    vi.mocked(copyEntityPictureIfExists).mockResolvedValue(undefined);
    mockDbReturning.mockResolvedValue([{ id: 'scenario-copy' }]);

    await duplicateLearningScenario({
      originalLearningScenarioId: sourceLearningScenario.id,
      user: { id: 'user-1' },
    });

    expect(mockDbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        licenseInformation: 'Scenario license',
        didacticCommentary: 'Scenario teaching notes',
      }),
    );
  });

  it('should throw NotFoundError when the original learning scenario does not exist', async () => {
    vi.mocked(dbGetLearningScenarioById).mockResolvedValue(undefined);

    await expect(
      duplicateLearningScenario({
        originalLearningScenarioId: 'missing-scenario',
        user: { id: 'user-1' },
      }),
    ).rejects.toThrow(NotFoundError);
  });
});
