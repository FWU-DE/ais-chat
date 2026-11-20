import type { Nodes, Root } from 'mdast';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math-extended';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { SKIP, visit } from 'unist-util-visit';
import { z } from 'zod';

import { env } from '@/env';
import { PLOT_LANGUAGE } from '@/utils/code-blocks';

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
  plots: z
    .array(
      z.object({
        code: z.string().min(1).max(50_000),
        data: z.base64().max(2_000_000),
      }),
    )
    .max(10)
    .default([]),
});

// Images are only embedded as data URLs and math keeps its marker classes; the default schema drops both.
const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, src: ['data'] },
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ['className', 'language-math', 'math-inline', 'math-display'],
    ],
  },
};

type PdfRequest = z.infer<typeof pdfRequestSchema>;

function resolveImageReferences(images: PdfRequest['images']) {
  const imageMap = new Map(
    images.map((image) => [image.source, `data:${image.mimeType};base64,${image.data}`]),
  );

  return () => (tree: Root) => {
    visit(tree, 'image', (node, index, parent) => {
      if (parent === undefined || index === undefined) return;
      const dataUrl = imageMap.get(node.url);
      if (dataUrl === undefined) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      node.url = dataUrl;
    });
  };
}

function embedPlots(plots: PdfRequest['plots']) {
  const plotMap = new Map(plots.map((plot) => [plot.code, `data:image/png;base64,${plot.data}`]));

  return () => (tree: Root) => {
    visit(tree, 'code', (node, index, parent) => {
      const url = node.lang === PLOT_LANGUAGE ? plotMap.get(node.value) : undefined;
      if (parent === undefined || index === undefined || url === undefined) return;
      parent.children[index] = {
        type: 'paragraph',
        children: [{ type: 'image', url, alt: 'Plot' }],
      };
    });
  };
}

// "---" separators and lines directly before a heading are dropped; other "___" lines stay as fill-in lines.
function keepOnlyFillInLines() {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value);
    const isFillInLine = (node: Nodes) =>
      node.type === 'thematicBreak' && source.charAt(node.position?.start.offset ?? 0) === '_';

    visit(tree, 'thematicBreak', (node, index, parent) => {
      if (parent === undefined || index === undefined || isFillInLine(node)) return;
      parent.children.splice(index, 1);
      return [SKIP, index];
    });
    visit(tree, 'thematicBreak', (node, index, parent) => {
      if (parent === undefined || index === undefined) return;
      if (parent.children[index + 1]?.type !== 'heading') return;
      parent.children.splice(index, 1);
      return [SKIP, index];
    });
    // A line right after a list belongs to its last item so it keeps the item's indentation.
    visit(tree, 'thematicBreak', (node, index, parent) => {
      const previous = parent?.children[(index ?? 0) - 1];
      const lastItem = previous?.type === 'list' ? previous.children.at(-1) : undefined;
      if (parent === undefined || index === undefined || lastItem === undefined) return;
      lastItem.children.push(node);
      parent.children.splice(index, 1);
      return [SKIP, index];
    });
  };
}

async function markdownToPdfHtml({ markdown, title, images, plots }: PdfRequest) {
  const body = String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(keepOnlyFillInLines)
      .use(resolveImageReferences(images))
      .use(embedPlots(plots))
      .use(remarkRehype)
      .use(rehypeSanitize, sanitizeSchema)
      // MathML needs no CSS or fonts, Chromium renders it with the container's math font.
      .use(rehypeKatex, { output: 'mathml' })
      .use(rehypeStringify)
      .process(markdown),
  );
  const safeTitle = title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>@page { size: A4; margin: 18mm; } body { color:#1f2933; font-family:Arial,sans-serif; font-size:11pt; line-height:1.5; } h1 { font-size:20pt; } h2 { font-size:16pt; } h3 { font-size:13pt; } table { border-collapse:collapse; width:100%; margin:12pt 0; } th,td { border:1px solid #9aa5b1; padding:6pt; text-align:left; } th { background:#f1f5f9; } img { max-width:100%; max-height:220mm; display:block; margin:8pt auto; } pre { background:#f2f4f7; padding:8pt; white-space:pre-wrap; } code { font-family:monospace; } hr { border:0; border-top:1px solid #1f2933; margin:20pt 0 0; } ul:has(> li > hr:only-child) { padding-left:0; list-style:none; } li:has(> hr:only-child) { list-style:none; margin:0; }</style></head><body>${body}</body></html>`;
}

const GOTENBERG_TIMEOUT_MS = 30_000;

export async function generatePdfFromMarkdown(input: PdfRequest): Promise<Buffer> {
  const html = await markdownToPdfHtml(input);
  const form = new FormData();
  form.set('files', new Blob([html], { type: 'text/html' }), 'index.html');
  form.set('preferCssPageSize', 'true');
  form.set('printBackground', 'true');
  form.set('nativeTaggedPdf', 'true');

  const response = await fetch(new URL('/forms/chromium/convert/html', env.gotenbergUrl), {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(GOTENBERG_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Gotenberg PDF conversion failed: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
