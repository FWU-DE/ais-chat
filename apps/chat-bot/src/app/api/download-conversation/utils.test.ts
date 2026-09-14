import { Readable } from 'stream';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type FileModel } from '@shared/db/schema';

const mocks = vi.hoisted(() => ({
  getFileFromS3: vi.fn(),
  imageRun: vi.fn(),
}));

vi.mock('@shared/s3', () => ({
  getFileFromS3: mocks.getFileFromS3,
}));

vi.mock('@shared/db/functions/llm-model', () => ({
  dbGetModelByName: vi.fn(),
}));

vi.mock('@shared/logging', () => ({
  logError: vi.fn(),
}));

vi.mock('docx', () => ({
  AlignmentType: { START: 'start' },
  convertInchesToTwip: vi.fn((value: number) => value * 1440),
  Document: class Document {
    constructor(public options: unknown) {}
  },
  ImageRun: class ImageRun {
    constructor(public options: unknown) {
      mocks.imageRun(options);
    }
  },
  Packer: {
    toArrayBuffer: vi.fn(),
  },
  Paragraph: class Paragraph {
    constructor(public options: unknown = {}) {}
  },
  Table: class Table {},
  TextRun: class TextRun {
    constructor(public options: unknown) {}
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

async function createPngBuffer({ width, height }: { width: number; height: number }) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#ffffff',
    },
  })
    .png()
    .toBuffer();
}

function createFile(overrides: Partial<FileModel> = {}): FileModel {
  return {
    id: 'file-1',
    name: 'image.png',
    type: 'image/png',
    size: 1,
    createdAt: new Date('2026-01-01'),
    metadata: null,
    userId: 'user-1',
    conversationMessageId: 'message-1',
    ...overrides,
  } as FileModel;
}

describe('getImageParagraphsForMessage', () => {
  it('derives missing image dimensions from the downloaded image buffer', async () => {
    const imageBuffer = await createPngBuffer({ width: 400, height: 200 });

    mocks.getFileFromS3.mockResolvedValue(Readable.from([imageBuffer]));

    const { getImageParagraphsForMessage } = await import('./utils');

    await getImageParagraphsForMessage({
      messageId: 'message-1',
      fileMapping: new Map([
        [
          'message-1',
          [
            createFile({
              size: imageBuffer.length,
            }),
          ],
        ],
      ]),
    });

    expect(mocks.imageRun).toHaveBeenCalledWith(
      expect.objectContaining({
        transformation: {
          width: 400,
          height: 200,
        },
      }),
    );
  });

  it('ignores files that are not images', async () => {
    const { getImageParagraphsForMessage } = await import('./utils');

    const result = await getImageParagraphsForMessage({
      messageId: 'message-1',
      fileMapping: new Map([
        [
          'message-1',
          [
            createFile({
              id: 'file-1',
              name: 'document.pdf',
              type: 'application/pdf',
            }),
          ],
        ],
      ]),
    });

    expect(result).toEqual([]);
    expect(mocks.getFileFromS3).not.toHaveBeenCalled();
    expect(mocks.imageRun).not.toHaveBeenCalled();
  });

  it('keeps valid images when another image cannot be loaded', async () => {
    const imageBuffer = await createPngBuffer({ width: 120, height: 80 });

    mocks.getFileFromS3.mockImplementation((key: string) => {
      if (key === 'message_attachments/valid-image') {
        return Promise.resolve(Readable.from([imageBuffer]));
      }

      return Promise.reject(new Error('S3 read failed'));
    });

    const { getImageParagraphsForMessage } = await import('./utils');

    const result = await getImageParagraphsForMessage({
      messageId: 'message-1',
      fileMapping: new Map([
        [
          'message-1',
          [
            createFile({ id: 'valid-image', name: 'valid-image.png' }),
            createFile({ id: 'broken-image', name: 'broken-image.png' }),
          ],
        ],
      ]),
    });

    expect(result).toHaveLength(1);
    expect(mocks.imageRun).toHaveBeenCalledTimes(1);
  });

  it('uses stored image dimensions and scales exported images by height', async () => {
    const imageBuffer = await createPngBuffer({ width: 10, height: 10 });

    mocks.getFileFromS3.mockResolvedValue(Readable.from([imageBuffer]));

    const { getImageParagraphsForMessage } = await import('./utils');

    await getImageParagraphsForMessage({
      messageId: 'message-1',
      fileMapping: new Map([
        [
          'message-1',
          [
            createFile({
              metadata: {
                width: 800,
                height: 400,
              },
            }),
          ],
        ],
      ]),
    });

    expect(mocks.imageRun).toHaveBeenCalledWith(
      expect.objectContaining({
        transformation: {
          width: 512,
          height: 256,
        },
      }),
    );
  });
});
