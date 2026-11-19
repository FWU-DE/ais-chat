import type { Root } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it, vi } from 'vitest';

import {
  collectUploadedImageUrls,
  createAllowedImages,
  findAllowedImageUrl,
  loadDocumentImage,
} from './document-images';
import { remarkRemoveUnapprovedImages } from './document-markdown';
import { createConversationExportMessages, formatConversationExport } from './markdown-docx';

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

  it('keeps the first image when normalized names collide', () => {
    const images = createAllowedImages([
      { name: 'Photo.PNG', url: '/img/first' },
      { name: 'photo.png', url: '/img/second' },
    ]);

    expect(findAllowedImageUrl('photo.png', images)).toBe('/img/first');
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

  it('encodes parentheses in uploaded image destinations', () => {
    const { markdownBlocks } = formatConversationExport({
      messages: [
        {
          id: '1',
          role: 'user',
          content: 'Hallo',
          images: [{ alt: 'images (1).jpg', url: '/img/1' }],
        },
      ],
      createdAt: '2026-11-19T10:00:00.000Z',
      modelName: 'Modell',
    });

    expect(markdownBlocks.map(({ markdown }) => markdown)).toContain(
      '![images (1).jpg](images%20%281%29.jpg)',
    );
  });

  it('keeps approved reference-style images', () => {
    const tree = unified().use(remarkParse).parse('![Foto][foto]\n\n[foto]: Foto.png') as Root;
    const allowedImages = createAllowedImages([{ name: 'Foto.png', url: '/img/1' }]);

    remarkRemoveUnapprovedImages(allowedImages)(tree);

    expect(tree.children[0]).toMatchObject({
      children: [{ type: 'image', url: 'Foto.png' }],
    });
  });

  it('formats the conversation title and assistant heading', () => {
    const { markdownBlocks } = formatConversationExport({
      messages: [{ id: '1', role: 'assistant', content: 'Antwort', images: [] }],
      createdAt: '2026-11-19T10:00:00.000Z',
      modelName: 'Modell',
      conversationTitle: 'Meine Konversation',
    });

    expect(markdownBlocks.map(({ markdown }) => markdown)).toContain(
      '# Konversation: Meine Konversation',
    );
    expect(markdownBlocks.map(({ markdown }) => markdown)).toContain('### AIS.chat:');
  });
});

describe('createConversationExportMessages', () => {
  it('maps uploaded images and excludes non-image files', () => {
    const messages = createConversationExportMessages({
      messages: [{ id: 'message-1', role: 'user', content: 'Hallo' }],
      fileMapping: new Map([
        [
          'message-1',
          [
            { id: 'image-1', name: 'Foto.png' },
            { id: 'file-1', name: 'Notizen.pdf' },
          ],
        ],
      ]),
      imageUrl: (file) => `/preview/${file.id}`,
    });

    expect(messages).toEqual([
      {
        id: 'message-1',
        role: 'user',
        content: 'Hallo',
        images: [{ alt: 'Foto.png', url: '/preview/image-1' }],
      },
    ]);
  });
});

describe('loadDocumentImage', () => {
  it('returns embeddable images without conversion', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const bitmap = { width: 100, height: 100, close: vi.fn() };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => blob }));
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

    await expect(loadDocumentImage('/img/1')).resolves.toEqual(await blob.arrayBuffer());
    expect(bitmap.close).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('scales non-embeddable images before returning PNG data', async () => {
    const bitmap = { width: 480, height: 240, close: vi.fn() };
    const context = { drawImage: vi.fn() };
    const png = new Blob(['png'], { type: 'image/png' });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(context),
      toBlob: vi.fn((callback: BlobCallback) => callback(png)),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => new Blob(['webp'], { type: 'image/webp' }),
      }),
    );
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal('document', { createElement: vi.fn().mockReturnValue(canvas) });

    await expect(loadDocumentImage('/img/1')).resolves.toEqual(await png.arrayBuffer());
    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(120);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 240, 120);
    expect(bitmap.close).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('reports image loading and conversion failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(loadDocumentImage('/missing')).rejects.toThrow('Failed to load image: 404');

    const bitmap = { width: 480, height: 240, close: vi.fn() };
    const canvas = {
      getContext: vi.fn().mockReturnValue(null),
      toBlob: vi.fn(),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: () => new Blob(['webp'], { type: 'image/webp' }),
      }),
    );
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal('document', { createElement: vi.fn().mockReturnValue(canvas) });
    await expect(loadDocumentImage('/no-context')).rejects.toThrow(
      'Failed to create image canvas context',
    );
    expect(bitmap.close).toHaveBeenCalledOnce();

    const context = { drawImage: vi.fn() };
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue({
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue(context),
        toBlob: vi.fn((callback: BlobCallback) => callback(null)),
      }),
    });
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({
        width: 480,
        height: 240,
        close: vi.fn(),
      }),
    );
    await expect(loadDocumentImage('/encode-failure')).rejects.toThrow('Failed to encode image');
    vi.unstubAllGlobals();
  });
});
