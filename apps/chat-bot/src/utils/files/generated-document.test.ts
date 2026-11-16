import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

import { createGeneratedDocumentBlob } from './generated-document';
import { createGeneratedDocumentFileName } from './generated-document-format';

const MARKDOWN = `# Arbeitsblatt Bruchrechnen

Äöü ß – **fett**, *kursiv* und [Link](https://example.com).

| Aufgabe | Lösung |
| --- | --- |
| 1/2 + 1/4 | 3/4 |

- Erster Punkt
- Zweiter Punkt

![Extern](https://example.com/tracker.png)
`;

async function readBytes(blob: Blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('createGeneratedDocumentFileName', () => {
  it('uses the title and appends the format extension', () => {
    expect(createGeneratedDocumentFileName('Arbeitsblatt Bruchrechnen', 'docx', 'Dokument')).toBe(
      'Arbeitsblatt Bruchrechnen.docx',
    );
  });

  it('removes characters that are invalid in file names', () => {
    expect(createGeneratedDocumentFileName('Mathe: 1/2 <Test>?', 'docx', 'Dokument')).toBe(
      'Mathe 1 2 Test.docx',
    );
  });

  it('falls back when the title is missing or empty after cleaning', () => {
    expect(createGeneratedDocumentFileName(undefined, 'docx', 'Dokument')).toBe('Dokument.docx');
    expect(createGeneratedDocumentFileName(' ../ ', 'docx', 'Dokument')).toBe('Dokument.docx');
  });

  it('limits the length of long titles', () => {
    const fileName = createGeneratedDocumentFileName('a'.repeat(300), 'docx', 'Dokument');
    expect(fileName).toBe(`${'a'.repeat(80)}.docx`);
  });

  it('uses the PDF extension', () => {
    expect(createGeneratedDocumentFileName('Arbeitsblatt', 'pdf', 'Dokument')).toBe(
      'Arbeitsblatt.pdf',
    );
  });
});

describe('createGeneratedDocumentBlob', () => {
  it('resolves attachment references in generated HTML', async () => {
    vi.stubGlobal('DOMParser', new JSDOM().window.DOMParser);
    const imageBlob = new Blob(['png'], { type: 'image/png' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => imageBlob }));
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({
        width: 1,
        height: 1,
        close: vi.fn(),
      }),
    );
    const blob = await createGeneratedDocumentBlob(
      '<!doctype html><html><body><img src="attachment://file-1"></body></html>',
      'html',
      new Map([['attachment://file-1', '/api/files/file-1/scaled-image']]),
    );

    await expect(blob.text()).resolves.toContain('data:image/png;base64,cG5n');
    vi.unstubAllGlobals();
  });

  it('uses the document title for generated HTML metadata', async () => {
    vi.stubGlobal('DOMParser', new JSDOM().window.DOMParser);
    const blob = await createGeneratedDocumentBlob(
      '<!doctype html><html><head><title>Arbeitsblatt</title></head><body><p>Inhalt</p></body></html>',
      'html',
    );

    await expect(blob.text()).resolves.toContain('<title>Arbeitsblatt</title>');
    vi.unstubAllGlobals();
  });

  it('creates a PDF from Markdown', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Buffer.from('%PDF-test'), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      }),
    );
    try {
      const blob = await createGeneratedDocumentBlob(MARKDOWN, 'pdf');
      const bytes = await readBytes(blob);

      expect(blob.type).toBe('application/pdf');
      expect(new TextDecoder().decode(bytes)).toBe('%PDF-test');
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/generate-document/pdf',
        expect.objectContaining({ method: 'POST' }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  }, 30_000);

  it('creates a DOCX (zip) and loads external images from Markdown', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const blob = await createGeneratedDocumentBlob(MARKDOWN, 'docx');
      const bytes = await readBytes(blob);

      expect(blob.type).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(new TextDecoder().decode(bytes.slice(0, 2))).toBe('PK');
      expect(fetchSpy).toHaveBeenCalledWith('https://example.com/tracker.png');
    } finally {
      fetchSpy.mockRestore();
    }
  }, 30_000);
});
