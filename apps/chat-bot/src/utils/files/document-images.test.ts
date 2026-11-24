import { describe, expect, it, vi } from 'vitest';

import { arrayBufferToBase64, loadDocumentImage } from './document-images';
import { createConversationExportMessages, formatConversationExport } from './markdown-docx';

describe('formatConversationExport', () => {
  it('uses the image URL as the Markdown destination', () => {
    const { markdownBlocks } = formatConversationExport({
      messages: [
        {
          id: '1',
          role: 'user',
          content: 'Hallo',
          images: [{ alt: 'Mein Foto.PNG', url: 'https://example.com/image.png' }],
        },
      ],
      createdAt: '2026-11-19T10:00:00.000Z',
      modelName: 'Modell',
    });

    expect(markdownBlocks.map(({ markdown }) => markdown)).toContain(
      '![Mein Foto.PNG](https://example.com/image.png)',
    );
  });

  it('encodes parentheses in image destinations', () => {
    const { markdownBlocks } = formatConversationExport({
      messages: [
        {
          id: '1',
          role: 'user',
          content: 'Hallo',
          images: [{ alt: 'images (1).jpg', url: 'https://example.com/images (1).jpg' }],
        },
      ],
      createdAt: '2026-11-19T10:00:00.000Z',
      modelName: 'Modell',
    });

    expect(markdownBlocks.map(({ markdown }) => markdown)).toContain(
      '![images (1).jpg](https://example.com/images%20%281%29.jpg)',
    );
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

    await expect(loadDocumentImage('/img/1')).resolves.toMatchObject({
      data: await blob.arrayBuffer(),
      mimeType: 'image/png',
    });
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

    await expect(loadDocumentImage('/img/1')).resolves.toMatchObject({
      data: await png.arrayBuffer(),
      mimeType: 'image/png',
    });
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

  it('encodes parentheses in uploaded image destinations', () => {
    const { markdownBlocks } = formatConversationExport({
      messages: [
        {
          id: '1',
          role: 'user',
          content: 'Hallo',
          images: [{ alt: 'Mein Foto.PNG', url: 'https://example.com/image.png' }],
        },
      ],
      createdAt: '2026-11-19T10:00:00.000Z',
      modelName: 'Modell',
    });

    expect(markdownBlocks.map(({ markdown }) => markdown)).toContain(
      '![Mein Foto.PNG](https://example.com/image.png)',
    );
  });

  it('encodes parentheses in image destinations', () => {
    const { markdownBlocks } = formatConversationExport({
      messages: [
        {
          id: '1',
          role: 'user',
          content: 'Hallo',
          images: [{ alt: 'images (1).jpg', url: 'https://example.com/images (1).jpg' }],
        },
      ],
      createdAt: '2026-11-19T10:00:00.000Z',
      modelName: 'Modell',
    });

    expect(markdownBlocks.map(({ markdown }) => markdown)).toContain(
      '![images (1).jpg](https://example.com/images%20%281%29.jpg)',
    );
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

    await expect(loadDocumentImage('/img/1')).resolves.toEqual({
      data: await blob.arrayBuffer(),
      mimeType: 'image/png',
    });
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

    await expect(loadDocumentImage('/img/1')).resolves.toEqual({
      data: await png.arrayBuffer(),
      mimeType: 'image/png',
    });
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

describe('arrayBufferToBase64', () => {
  it('encodes small buffers', () => {
    expect(arrayBufferToBase64(new TextEncoder().encode('Hallo').buffer)).toBe('SGFsbG8=');
  });

  it('encodes buffers larger than the chunk size', () => {
    const bytes = new Uint8Array(100_000).fill(65);

    expect(arrayBufferToBase64(bytes.buffer)).toBe(Buffer.from(bytes).toString('base64'));
  });
});
