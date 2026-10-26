import type { DocumentBlock, DocumentImageResolver } from './markdown-document';
import { parseMarkdownDocument } from './markdown-document';

export type EmbeddedFont = {
  family: string;
  data: Uint8Array;
  format: 'truetype' | 'woff' | 'woff2';
  weight?: number;
  style?: 'normal' | 'italic';
};

export type MarkdownHtmlOptions = {
  imageResolver?: DocumentImageResolver;
  fonts?: EmbeddedFont[];
  fontFamily?: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function renderBlock(
  block: DocumentBlock,
  imageResolver: DocumentImageResolver | undefined,
): Promise<string> {
  if (block.type === 'heading') {
    return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
  }
  if (block.type === 'paragraph') {
    return `<p>${escapeHtml(block.text)}</p>`;
  }
  if (block.type === 'list') {
    const tag = block.ordered ? 'ol' : 'ul';
    return `<${tag}>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</${tag}>`;
  }
  if (block.type === 'table') {
    const [header = [], ...body] = block.rows;
    return `<table><thead><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>${body
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`;
  }
  if (block.type === 'image') {
    if (imageResolver === undefined) {
      throw new Error(`No image resolver configured for ${block.source}`);
    }
    const image = await imageResolver(block.source);
    const source = `data:${image.mimeType};base64,${Buffer.from(image.data).toString('base64')}`;
    return `<figure><img src="${source}" alt="${escapeHtml(block.alt)}" width="${image.width}" height="${image.height}"></figure>`;
  }
  if (block.type === 'code') {
    const language =
      block.language === undefined ? '' : ` class="language-${escapeHtml(block.language)}"`;
    return `<pre><code${language}>${escapeHtml(block.value)}</code></pre>`;
  }
  return '<div class="page-break"></div>';
}

export async function renderMarkdownHtml(
  markdown: string,
  { imageResolver, fonts = [], fontFamily = 'Arial, sans-serif' }: MarkdownHtmlOptions = {},
): Promise<string> {
  const document = parseMarkdownDocument(markdown);
  const fontFaces = fonts
    .map(
      (font) => `@font-face {
  font-family: '${escapeHtml(font.family)}';
  src: url(data:font/${font.format};base64,${Buffer.from(font.data).toString('base64')}) format('${font.format}');
  font-weight: ${font.weight ?? 400};
  font-style: ${font.style ?? 'normal'};
}`,
    )
    .join('\n');
  const blocks = await Promise.all(
    document.blocks.map((block) => renderBlock(block, imageResolver)),
  );

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">
<title>${escapeHtml(document.title)}</title>
<style>
${fontFaces}
@page { size: A4; margin: 18mm; }
body { color: #1f2933; font-family: ${fontFamily}; font-size: 11pt; line-height: 1.5; }
h1 { font-size: 24pt; margin: 0 0 18pt; }
h2 { font-size: 18pt; margin: 20pt 0 8pt; break-after: avoid; }
h3, h4, h5, h6 { break-after: avoid; }
p, li { orphans: 3; widows: 3; }
table { border-collapse: collapse; margin: 12pt 0; width: 100%; }
th, td { border: 1px solid #9aa5b1; padding: 6pt; text-align: left; }
thead { display: table-header-group; }
img { display: block; height: auto; margin: 0 auto; max-height: 220mm; max-width: 100%; }
figure { break-inside: avoid; margin: 12pt 0; }
pre { background: #f2f4f7; padding: 10pt; white-space: pre-wrap; }
.page-break { break-after: page; }
</style>
</head>
<body>
<h1>${escapeHtml(document.title)}</h1>
${blocks.join('\n')}
</body>
</html>`;
}
