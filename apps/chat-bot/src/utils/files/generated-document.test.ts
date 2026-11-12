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
    expect(createGeneratedDocumentFileName('Mathe: 1/2 <Test>?', 'pdf', 'Dokument')).toBe(
      'Mathe 1 2 Test.pdf',
    );
  });

  it('falls back when the title is missing or empty after cleaning', () => {
    expect(createGeneratedDocumentFileName(undefined, 'pdf', 'Dokument')).toBe('Dokument.pdf');
    expect(createGeneratedDocumentFileName(' ../ ', 'pdf', 'Dokument')).toBe('Dokument.pdf');
  });

  it('limits the length of long titles', () => {
    const fileName = createGeneratedDocumentFileName('a'.repeat(300), 'docx', 'Dokument');
    expect(fileName).toBe(`${'a'.repeat(80)}.docx`);
  });
});

describe('createGeneratedDocumentBlob', () => {
  it('creates a PDF from Markdown', async () => {
    const blob = await createGeneratedDocumentBlob(MARKDOWN, 'pdf');
    const bytes = await readBytes(blob);

    expect(blob.type).toBe('application/pdf');
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('creates a multi-page PDF for long documents', async () => {
    const longMarkdown = Array.from(
      { length: 150 },
      (_, index) => `## Abschnitt ${index}\n\n${'Text '.repeat(60)}`,
    ).join('\n\n');

    const short = await readBytes(await createGeneratedDocumentBlob(MARKDOWN, 'pdf'));
    const long = await readBytes(await createGeneratedDocumentBlob(longMarkdown, 'pdf'));

    expect(long.length).toBeGreaterThan(short.length * 3);
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
