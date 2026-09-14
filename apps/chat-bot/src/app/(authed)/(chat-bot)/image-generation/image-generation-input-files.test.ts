import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@shared/error';
import { LlmModelSelectModel } from '@shared/db/schema';
import { IMAGE_GENERATION_INPUT_LIMIT } from '@/configuration-text-inputs/const';

const mocks = vi.hoisted(() => ({
  dbGetFilesInIdsMock: vi.fn(),
  getFileFromS3Mock: vi.fn(),
}));

vi.mock('@shared/db/functions/files', () => ({
  dbGetFilesInIds: mocks.dbGetFilesInIdsMock,
}));

vi.mock('@shared/s3', () => ({
  getFileFromS3: mocks.getFileFromS3Mock,
}));

const imageModel = {
  id: 'model-1',
  name: 'image-model',
  provider: 'bifrost',
  supportedImageFormats: ['png', 'jpeg'],
} as LlmModelSelectModel;

const fileRecord = {
  id: 'file-1',
  userId: 'user-1',
  type: 'png',
  name: 'photo.png',
  size: 10,
  createdAt: new Date('2026-01-01'),
  metadata: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validateInputFiles', () => {
  it('accepts an empty file list regardless of model support', async () => {
    const { validateInputFiles } = await import('./image-generation-input-files');

    expect(() =>
      validateInputFiles({
        model: { ...imageModel, supportedImageFormats: [] },
        inputFileIds: [],
      }),
    ).not.toThrow();
  });

  it('accepts input files when the model supports image inputs and the count is within limits', async () => {
    const { validateInputFiles } = await import('./image-generation-input-files');

    expect(() =>
      validateInputFiles({
        model: imageModel,
        inputFileIds: ['file-1', 'file-2'],
      }),
    ).not.toThrow();
  });

  it('rejects input files when the selected model does not declare any supported image formats', async () => {
    const { validateInputFiles } = await import('./image-generation-input-files');

    expect(() =>
      validateInputFiles({
        model: { ...imageModel, supportedImageFormats: [] },
        inputFileIds: ['file-1'],
      }),
    ).toThrow('Selected image model does not support image inputs');
  });

  it('rejects when the number of input files exceeds IMAGE_GENERATION_INPUT_LIMIT', async () => {
    const { validateInputFiles } = await import('./image-generation-input-files');
    const tooMany = Array.from({ length: IMAGE_GENERATION_INPUT_LIMIT + 1 }, (_, i) => `file-${i}`);

    expect(() =>
      validateInputFiles({
        model: imageModel,
        inputFileIds: tooMany,
      }),
    ).toThrow(`exceeds the limit of ${IMAGE_GENERATION_INPUT_LIMIT}`);
  });
});

describe('fetchInputImages', () => {
  it('returns an empty array without touching the database when no fileIds are provided', async () => {
    const { fetchInputImages } = await import('./image-generation-input-files');

    const result = await fetchInputImages({ inputFileIds: [], userId: 'user-1' });

    expect(result).toEqual([]);
    expect(mocks.dbGetFilesInIdsMock).not.toHaveBeenCalled();
    expect(mocks.getFileFromS3Mock).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when a requested file record does not exist', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([]);
    const { fetchInputImages } = await import('./image-generation-input-files');

    await expect(
      fetchInputImages({ inputFileIds: ['file-missing'], userId: 'user-1' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when the file belongs to a different user', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([{ ...fileRecord, userId: 'other-user' }]);
    const { fetchInputImages } = await import('./image-generation-input-files');

    await expect(
      fetchInputImages({ inputFileIds: ['file-1'], userId: 'user-1' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mocks.getFileFromS3Mock).not.toHaveBeenCalled();
  });

  it('rejects files whose mime type is not an image', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([{ ...fileRecord, type: 'pdf', name: 'doc.pdf' }]);
    const { fetchInputImages } = await import('./image-generation-input-files');

    await expect(fetchInputImages({ inputFileIds: ['file-1'], userId: 'user-1' })).rejects.toThrow(
      'Input file is not an image',
    );
    expect(mocks.getFileFromS3Mock).not.toHaveBeenCalled();
  });

  it('fetches image data from S3 and returns ImageGenerationInputImage entries preserving order', async () => {
    mocks.dbGetFilesInIdsMock.mockResolvedValue([
      { ...fileRecord, id: 'file-a', type: 'png', name: 'a.png' },
      { ...fileRecord, id: 'file-b', type: 'jpeg', name: 'b.jpg' },
    ]);
    mocks.getFileFromS3Mock.mockImplementation((key: string) =>
      Promise.resolve(Readable.from([Buffer.from(`data-${key}`)])),
    );

    const { fetchInputImages } = await import('./image-generation-input-files');

    const result = await fetchInputImages({
      inputFileIds: ['file-a', 'file-b'],
      userId: 'user-1',
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      data: Buffer.from('data-message_attachments/file-a'),
      mimeType: 'image/png',
      filename: 'a.png',
    });
    expect(result[1]).toEqual({
      data: Buffer.from('data-message_attachments/file-b'),
      mimeType: 'image/jpeg',
      filename: 'b.jpg',
    });
    expect(mocks.getFileFromS3Mock).toHaveBeenNthCalledWith(1, 'message_attachments/file-a');
    expect(mocks.getFileFromS3Mock).toHaveBeenNthCalledWith(2, 'message_attachments/file-b');
  });
});
