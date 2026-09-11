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

describe('getImageParagraphsForMessage', () => {
  it('derives missing image dimensions from the downloaded image buffer', async () => {
    const imageBuffer = await sharp({
      create: {
        width: 400,
        height: 200,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();

    mocks.getFileFromS3.mockResolvedValue(Readable.from([imageBuffer]));

    const { getImageParagraphsForMessage } = await import('./utils');

    await getImageParagraphsForMessage({
      messageId: 'message-1',
      fileMapping: new Map([
        [
          'message-1',
          [
            {
              id: 'file-1',
              name: 'image.png',
              type: 'image/png',
              size: imageBuffer.length,
              createdAt: new Date('2026-01-01'),
              metadata: null,
              userId: 'user-1',
              conversationMessageId: 'message-1',
            } as FileModel,
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
});
