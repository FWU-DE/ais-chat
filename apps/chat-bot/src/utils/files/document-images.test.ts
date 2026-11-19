import { describe, expect, it } from 'vitest';

import {
  collectUploadedImageUrls,
  createAllowedImages,
  findAllowedImageUrl,
} from './document-images';
import { formatConversationExport } from './markdown-docx';

describe('createAllowedImages', () => {
  it('finds images by file name regardless of case, spaces and URL encoding', () => {
    const images = createAllowedImages([{ name: 'Mein Foto.PNG', url: '/img/1' }]);

    expect(findAllowedImageUrl('Mein%20Foto.PNG', images)).toBe('/img/1');
    expect(findAllowedImageUrl('mein foto.png', images)).toBe('/img/1');
    expect(findAllowedImageUrl('uploads/Mein Foto.PNG', images)).toBe('/img/1');
  });

  it('does not match other names or external URLs', () => {
    const images = createAllowedImages([{ name: 'foto.png', url: '/img/1' }]);

    expect(findAllowedImageUrl('anderes.png', images)).toBeUndefined();
  });
});

describe('collectUploadedImageUrls', () => {
  it('prefers the local URL and ignores non-image files', () => {
    const images = collectUploadedImageUrls({
      messageFileMapping: new Map([
        [
          'm1',
          [
            { id: 'f1', name: 'Skizze.JPG', localUrl: 'blob:skizze' },
            { id: 'f2', name: 'Text.pdf', localUrl: 'blob:text' },
          ],
        ],
      ]),
    });

    expect(findAllowedImageUrl('skizze.jpg', images)).toBe('blob:skizze');
    expect(findAllowedImageUrl('Text.pdf', images)).toBeUndefined();
  });

  it('falls back to the scaled-image route only when a file mapping exists', () => {
    const withMapping = collectUploadedImageUrls({
      fileMapping: new Map([['m1', [{ id: 'f1', name: 'Foto.png' }]]]),
    });
    const withoutMapping = collectUploadedImageUrls({
      messageFileMapping: new Map([['m1', [{ id: 'f1', name: 'Foto.png' }]]]),
    });

    expect(findAllowedImageUrl('foto.png', withMapping)).toContain('/api/files/f1/scaled-image');
    expect(findAllowedImageUrl('foto.png', withoutMapping)).toBeUndefined();
  });
});

describe('formatConversationExport', () => {
  it('registers uploaded images so they are found again by their Markdown reference', () => {
    const { markdownBlocks, allowedImages } = formatConversationExport({
      messages: [
        {
          id: '1',
          role: 'user',
          content: 'Hallo',
          images: [{ alt: 'Mein Foto.PNG', url: '/img/1' }],
        },
      ],
      createdAt: '2026-11-19T10:00:00.000Z',
      modelName: 'Modell',
    });

    expect(markdownBlocks.map(({ markdown }) => markdown)).toContain(
      '![Mein Foto.PNG](Mein%20Foto.PNG)',
    );
    expect(findAllowedImageUrl('Mein%20Foto.PNG', allowedImages ?? new Map())).toBe('/img/1');
  });
});
