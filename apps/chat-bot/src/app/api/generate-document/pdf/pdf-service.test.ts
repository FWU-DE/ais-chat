import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/env', () => ({ env: { gotenbergUrl: 'http://gotenberg:8002/' } }));

import { generatePdfFromMarkdown, pdfRequestSchema } from './pdf-service';

const PNG_BASE64 = 'iVBORw0KGgo=';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

function buildRequest(overrides: Record<string, unknown> = {}) {
  return pdfRequestSchema.parse({ markdown: '# Hallo', title: 'Titel', images: [], ...overrides });
}

async function renderHtml(overrides: Record<string, unknown> = {}) {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('%PDF-test', { status: 200 }));
  await generatePdfFromMarkdown(buildRequest(overrides));

  const firstCall = fetchSpy.mock.calls[0];
  if (firstCall === undefined) throw new Error('Expected Gotenberg request');
  const [url, init] = firstCall;
  const form = (init as RequestInit).body as FormData;
  return { url, form, html: await (form.get('files') as File).text() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pdfRequestSchema', () => {
  it('defaults plots to an empty list', () => {
    expect(buildRequest().plots).toEqual([]);
  });

  it.each([
    { markdown: '' },
    { title: '   ' },
    { images: [{ source: 'a', mimeType: 'image/gif', data: PNG_BASE64 }] },
    { images: [{ source: 'a', mimeType: 'image/png', data: 'not base64!' }] },
    { plots: [{ code: '', data: PNG_BASE64 }] },
  ])('rejects invalid input %#', (overrides) => {
    expect(
      pdfRequestSchema.safeParse({ markdown: '# Hallo', title: 'Titel', images: [], ...overrides })
        .success,
    ).toBe(false);
  });
});

describe('generatePdfFromMarkdown', () => {
  it('sends the HTML as index.html to Gotenberg and returns the PDF bytes', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('%PDF-test', { status: 200 }));

    const pdf = await generatePdfFromMarkdown(buildRequest());

    const firstCall = fetchSpy.mock.calls[0];
    if (firstCall === undefined) throw new Error('Expected Gotenberg request');
    const [url, init] = firstCall;
    const form = (init as RequestInit).body as FormData;
    expect(String(url)).toBe('http://gotenberg:8002/forms/chromium/convert/html');
    expect((init as RequestInit).method).toBe('POST');
    expect((form.get('files') as File).name).toBe('index.html');
    expect(form.get('preferCssPageSize')).toBe('true');
    expect(form.get('printBackground')).toBe('true');
    expect(form.get('nativeTaggedPdf')).toBe('true');
    expect(pdf.toString()).toBe('%PDF-test');
  });

  it('throws when Gotenberg responds with an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));

    await expect(generatePdfFromMarkdown(buildRequest())).rejects.toThrow(
      'Gotenberg PDF conversion failed: 500',
    );
  });

  it('renders Markdown tables and escapes the title', async () => {
    const { html } = await renderHtml({
      markdown: '| A | B |\n| --- | --- |\n| 1 | 2 |',
      title: 'A & <b>',
    });

    expect(html).toContain('<table>');
    expect(html).toContain('<title>A &#x26; &#x3C;b></title>');
  });

  it('renders math as MathML', async () => {
    const { html } = await renderHtml({ markdown: 'Formel $x^2$ und\n\n$$a+b$$' });

    expect(html).toContain('<math');
  });

  it('removes raw HTML and unsafe link protocols', async () => {
    const { html } = await renderHtml({
      markdown: '<script>alert(1)</script>\n\n[x](javascript:alert(1))',
    });

    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
  });

  it('replaces attachment images by data URLs and drops unknown images', async () => {
    const { html } = await renderHtml({
      markdown: '![Foto](attachment://file-1)\n\n![Extern](https://example.com/tracker.png)',
      images: [{ source: 'attachment://file-1', mimeType: 'image/png', data: PNG_BASE64 }],
    });

    expect(html).toContain(`src="${PNG_DATA_URL}"`);
    expect(html).not.toContain('example.com');
  });

  it('resolves reference-style images', async () => {
    const { html } = await renderHtml({
      markdown: '![Foto][bild]\n\n[bild]: attachment://file-1',
      images: [{ source: 'attachment://file-1', mimeType: 'image/png', data: PNG_BASE64 }],
    });

    expect(html).toContain(`src="${PNG_DATA_URL}"`);
  });

  it('does not let unresolved reference-style images load external URLs', async () => {
    const { html } = await renderHtml({
      markdown: '![Extern][bild]\n\n[bild]: https://example.com/tracker.png',
    });

    expect(html).not.toContain('example.com');
    expect(html).not.toContain('src=');
  });

  it('replaces plot code blocks by the rendered plot image', async () => {
    const code = '{"elements":[["point",[0,0]]]}';
    const { html } = await renderHtml({
      markdown: `\`\`\`jsxgraph-json\n${code}\n\`\`\``,
      plots: [{ code, data: PNG_BASE64 }],
    });

    expect(html).toContain(`src="${PNG_DATA_URL}"`);
    expect(html).toContain('alt="Plot"');
    expect(html).not.toContain('jsxgraph');
  });

  it('keeps plot code blocks without a rendered image', async () => {
    const { html } = await renderHtml({
      markdown: '```jsxgraph-json\n{"elements":[]}\n```',
    });

    expect(html).toContain('<pre>');
    expect(html).not.toContain('alt="Plot"');
  });
});
