import { describe, expect, it, vi } from 'vitest';
import { renderMarkdownHtml } from './markdown-html';
import { renderMarkdownPdf } from './markdown-pdf';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);

describe('renderMarkdownPdf', () => {
  it('renders tables and images without filesystem writes', async () => {
    const imageResolver = vi.fn().mockResolvedValue({
      data: ONE_PIXEL_PNG,
      mimeType: 'image/png',
      width: 1,
      height: 1,
    });

    const pdf = await renderMarkdownPdf(
      `# Lesson plan

| Topic | Duration |
| --- | --- |
| Introduction | 10 min |

![Generated diagram](attachment:file-1)`,
      { imageResolver },
    );

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1_000);
    expect(imageResolver).toHaveBeenCalledWith('attachment:file-1');
  });

  it('embeds custom fonts and blocks active content in the HTML source', async () => {
    const html = await renderMarkdownHtml('# Lesson\n\nSafe content', {
      fontFamily: "'School Font', sans-serif",
      fonts: [
        {
          family: 'School Font',
          data: Uint8Array.from([1, 2, 3]),
          format: 'woff2',
        },
      ],
    });

    expect(html).toContain("font-family: 'School Font'");
    expect(html).toContain('data:font/woff2;base64,AQID');
    expect(html).not.toContain('<script');
  });

  it('paginates long documents', async () => {
    const longMarkdown = [
      '# Long document',
      ...Array.from(
        { length: 120 },
        (_, index) => `## Section ${index + 1}\n\n${'Long content '.repeat(20)}`,
      ),
    ].join('\n\n');

    const shortPdf = await renderMarkdownPdf('# Short\n\nOne paragraph.');
    const longPdf = await renderMarkdownPdf(longMarkdown);

    expect(longPdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(longPdf.length).toBeGreaterThan(shortPdf.length * 5);
  });
});
