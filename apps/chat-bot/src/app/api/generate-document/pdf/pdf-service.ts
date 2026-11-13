import { existsSync } from 'node:fs';

import { chromium } from 'playwright-core';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { SKIP, visit } from 'unist-util-visit';
import { z } from 'zod';

export const pdfRequestSchema = z.object({
  markdown: z.string().min(1).max(100_000),
  title: z.string().trim().min(1).max(120),
  images: z
    .array(
      z.object({
        source: z.string().trim().min(1).max(500),
        mimeType: z.enum(['image/png', 'image/jpeg']),
        data: z.base64().max(2_000_000),
      }),
    )
    .max(20),
});

type PdfRequest = z.infer<typeof pdfRequestSchema>;

function findChromiumExecutable() {
  return ['/usr/bin/chromium-browser', '/usr/bin/chromium'].find(existsSync);
}

function normalizeImageSource(source: string) {
  return decodeURIComponent(source).replaceAll('\\', '/').split('/').at(-1)?.toLowerCase() ?? '';
}

function resolveUploadedImages(images: PdfRequest['images']) {
  const imageMap = new Map(
    images.map((image) => [
      normalizeImageSource(image.source),
      `data:${image.mimeType};base64,${image.data}`,
    ]),
  );

  return () => (tree: import('mdast').Root) => {
    visit(tree, 'image', (node, index, parent) => {
      if (parent === undefined || index === undefined) return;
      const dataUrl = imageMap.get(normalizeImageSource(node.url));
      if (dataUrl === undefined) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      node.url = dataUrl;
    });
  };
}

async function markdownToPdfHtml({ markdown, title, images }: PdfRequest) {
  const body = String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(resolveUploadedImages(images))
      .use(remarkRehype)
      .use(rehypeSanitize)
      .use(rehypeStringify)
      .process(markdown),
  );
  const safeTitle = title.replaceAll('<', '&lt;').replaceAll('>', '&gt;');

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>@page { size: A4; margin: 18mm; } body { color:#1f2933; font-family:Arial,sans-serif; font-size:11pt; line-height:1.5; } h1 { font-size:20pt; } h2 { font-size:16pt; } h3 { font-size:13pt; } table { border-collapse:collapse; width:100%; margin:12pt 0; } th,td { border:1px solid #9aa5b1; padding:6pt; text-align:left; } th { background:#f1f5f9; } img { max-width:100%; max-height:220mm; display:block; margin:8pt auto; } pre { background:#f2f4f7; padding:8pt; white-space:pre-wrap; } code { font-family:monospace; }</style></head><body>${body}</body></html>`;
}

export async function generatePdfFromMarkdown(input: PdfRequest): Promise<Buffer> {
  const html = await markdownToPdfHtml(input);
  const browser = await chromium.launch({
    headless: true,
    executablePath: findChromiumExecutable(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => route.abort());
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
    });
  } finally {
    await browser.close();
  }
}
