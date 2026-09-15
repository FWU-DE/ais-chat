import { describe, expect, it } from 'vitest';
import { buildImageSafetyMessages } from './image';

describe('buildImageSafetyMessages', () => {
  it('wraps prompt and images into a single user message', () => {
    const inputImage = {
      data: Buffer.from('image-data'),
      mimeType: 'image/png',
      filename: 'input.png',
    };

    expect(buildImageSafetyMessages('test prompt', [inputImage])).toEqual([
      {
        role: 'user',
        content: 'test prompt',
        images: [
          {
            type: 'image',
            contentType: 'image/png',
            url: `data:image/png;base64,${inputImage.data.toString('base64')}`,
          },
        ],
      },
    ]);
  });
});
