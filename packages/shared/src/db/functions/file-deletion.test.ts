import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
  deleteFileIfUnreferenced: vi.fn(),
}));

vi.mock('..', () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}));
vi.mock('./files', () => ({
  dbDeleteFileIfUnreferenced: mocks.deleteFileIfUnreferenced,
}));

import { dbDeleteAssistantByIdAndUser } from './assistants';
import { dbDeleteCharacterByIdAndUser } from './character';
import { dbDeleteLearningScenarioByIdAndUser } from './learning-scenario';

function queryResult(result: unknown[]) {
  const chain: Record<string, unknown> = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  return chain;
}

function setupDeletion({
  entity,
  fileId,
  fileDeleted,
}: {
  entity: unknown;
  fileId: string;
  fileDeleted: boolean;
}) {
  mocks.select.mockReturnValueOnce(queryResult([entity]));
  const txSelect = vi.fn().mockReturnValue(queryResult([{ id: fileId }]));
  const returning = vi.fn().mockResolvedValue([entity]);
  const txDelete = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({ returning }),
  });
  const tx = { select: txSelect, delete: txDelete };
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
  mocks.deleteFileIfUnreferenced.mockResolvedValue(fileDeleted);
  return { tx, returning };
}

describe('whole-entity file deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only unreferenced Character files for S3 cleanup', async () => {
    const entity = { id: 'character-1', userId: 'user-1' };
    const { tx } = setupDeletion({ entity, fileId: 'file-1', fileDeleted: true });

    const result = await dbDeleteCharacterByIdAndUser({
      characterId: entity.id,
      user: { id: entity.userId },
    });

    expect(result).toEqual({ deletedCharacter: entity, deletedFileIds: ['file-1'] });
    expect(mocks.deleteFileIfUnreferenced).toHaveBeenCalledWith(tx, 'file-1');
  });

  it('does not return a Character file that is still referenced', async () => {
    const entity = { id: 'character-1', userId: 'user-1' };
    setupDeletion({ entity, fileId: 'file-1', fileDeleted: false });

    const result = await dbDeleteCharacterByIdAndUser({
      characterId: entity.id,
      user: { id: entity.userId },
    });

    expect(result.deletedFileIds).toEqual([]);
  });

  it('returns only unreferenced Assistant files for S3 cleanup', async () => {
    const entity = { id: 'assistant-1', userId: 'user-1' };
    const { tx } = setupDeletion({ entity, fileId: 'file-1', fileDeleted: true });

    const result = await dbDeleteAssistantByIdAndUser({
      gptId: entity.id,
      user: { id: entity.userId },
    });

    expect(result).toEqual({ deletedAssistant: entity, deletedFileIds: ['file-1'] });
    expect(mocks.deleteFileIfUnreferenced).toHaveBeenCalledWith(tx, 'file-1');
  });

  it('does not return an Assistant file that is still referenced', async () => {
    const entity = { id: 'assistant-1', userId: 'user-1' };
    setupDeletion({ entity, fileId: 'file-1', fileDeleted: false });

    const result = await dbDeleteAssistantByIdAndUser({
      gptId: entity.id,
      user: { id: entity.userId },
    });

    expect(result.deletedFileIds).toEqual([]);
  });

  it('returns only unreferenced Learning Scenario files for S3 cleanup', async () => {
    const entity = { id: 'scenario-1', userId: 'user-1' };
    const { tx } = setupDeletion({ entity, fileId: 'file-1', fileDeleted: true });

    const result = await dbDeleteLearningScenarioByIdAndUser({
      learningScenarioId: entity.id,
      user: { id: entity.userId },
    });

    expect(result).toEqual({ deletedLearningScenario: entity, deletedFileIds: ['file-1'] });
    expect(mocks.deleteFileIfUnreferenced).toHaveBeenCalledWith(tx, 'file-1');
  });

  it('does not return a Learning Scenario file that is still referenced', async () => {
    const entity = { id: 'scenario-1', userId: 'user-1' };
    setupDeletion({ entity, fileId: 'file-1', fileDeleted: false });

    const result = await dbDeleteLearningScenarioByIdAndUser({
      learningScenarioId: entity.id,
      user: { id: entity.userId },
    });

    expect(result.deletedFileIds).toEqual([]);
  });
});
