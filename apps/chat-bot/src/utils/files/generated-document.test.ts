import { describe, expect, it, vi } from 'vitest';

import { createGeneratedDocumentBlob, createGeneratedDocumentFileName } from './generated-document';

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
  it('creates a PDF from Markdown', async () => {
    const blob = await createGeneratedDocumentBlob(MARKDOWN, 'pdf');
    const bytes = await readBytes(blob);

    expect(blob.type).toBe('application/pdf');
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('creates a DOCX (zip) from Markdown without loading images', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const blob = await createGeneratedDocumentBlob(MARKDOWN, 'docx');
    const bytes = await readBytes(blob);

    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(new TextDecoder().decode(bytes.slice(0, 2))).toBe('PK');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  }, 30_000);
});
