import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NotFoundError } from '@shared/error';

vi.mock('@shared/db/functions/files', () => ({
  dbGetFilesInIds: vi.fn(),
}));
vi.mock('@shared/s3', () => ({
  getFileFromS3: vi.fn(),
}));

import { dbGetFilesInIds } from '@shared/db/functions/files';
import { getFileFromS3 } from '@shared/s3';
import { createScaledImage } from './scaled-image-service';

describe('createScaledImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NotFoundError when the file is not an image', async () => {
    vi.mocked(dbGetFilesInIds).mockResolvedValue([{ id: 'file-1', type: 'pdf' }] as never);

    await expect(createScaledImage({ fileId: 'file-1', width: 100, height: 100 })).rejects.toThrow(
      NotFoundError,
    );
    expect(getFileFromS3).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the file does not exist', async () => {
    vi.mocked(dbGetFilesInIds).mockResolvedValue([]);

    await expect(createScaledImage({ fileId: 'file-1', width: 100, height: 100 })).rejects.toThrow(
      NotFoundError,
    );
    expect(getFileFromS3).not.toHaveBeenCalled();
  });

  it('accepts a file whose type is a MIME type and proceeds to fetch it', async () => {
    vi.mocked(dbGetFilesInIds).mockResolvedValue([{ id: 'file-1', type: 'image/png' }] as never);
    vi.mocked(getFileFromS3).mockRejectedValue(new Error('s3-reached'));

    await expect(createScaledImage({ fileId: 'file-1', width: 100, height: 100 })).rejects.toThrow(
      's3-reached',
    );
    expect(getFileFromS3).toHaveBeenCalledWith('message_attachments/file-1');
  });
});
