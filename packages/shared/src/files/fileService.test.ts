import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  copyFileInS3: vi.fn(),
  logError: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@shared/db', () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}));
vi.mock('@shared/s3', () => ({
  copyFileInS3: mocks.copyFileInS3,
  deleteFileFromS3: vi.fn(),
  deleteFilesFromS3: vi.fn(),
  getReadOnlySignedUrl: vi.fn(),
  uploadFileToS3: vi.fn(),
}));
vi.mock('@shared/logging', () => ({ logError: mocks.logError }));

import { duplicateFileWithEmbeddings } from './fileService';

function mockSelectResult(result: unknown) {
  const chain: Record<string, unknown> = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  mocks.select.mockReturnValueOnce(chain);
}

describe('duplicateFileWithEmbeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.copyFileInS3.mockResolvedValue(undefined);
  });

  it('assigns the target owner to the duplicated file', async () => {
    mockSelectResult([
      {
        id: 'file-source',
        userId: 'source-user',
        name: 'source.pdf',
        size: 10,
        type: 'application/pdf',
        metadata: null,
      },
    ]);
    mockSelectResult([]);

    const values = vi.fn().mockResolvedValue(undefined);
    const tx = { insert: vi.fn(() => ({ values })) };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));

    const newFileId = await duplicateFileWithEmbeddings('file-source', 'target-user');

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: newFileId,
        userId: 'target-user',
      }),
    );
    expect(values).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 'source-user' }));
  });
});
