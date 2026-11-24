import type { Root } from 'mdast';
import rehypeDocument from 'rehype-document';
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
import { MAX_FILE_NAME_LENGTH } from '@/utils/files/generated-document-format';

import { PDF_STYLES } from './pdf-styles';

export const pdfRequestSchema = z.object({
  markdown: z.string().min(1).max(100_000),
  title: z.string().trim().min(1).max(MAX_FILE_NAME_LENGTH),
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

type PdfRequest = z.infer<typeof pdfRequestSchema>;

// Images should only be embedded as data URLs and math should keep its marker classes; the default schema of rehypeSanitize would otherwise drops both.
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

// Replaces attachment:// image URLs by the uploaded data URLs and removes images that were not sent along.
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
    // Unresolved images are dropped by the sanitizer.
    visit(tree, 'definition', (node) => {
      node.url = imageMap.get(node.url) ?? node.url;
    });
  };
}

// Replaces jsxgraph-json code blocks by the plot images the browser rendered for exactly that code.
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

async function markdownToPdfHtml({ markdown, title, images, plots }: PdfRequest) {
  const body = String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(resolveImageReferences(images))
      .use(embedPlots(plots))
      .use(remarkRehype)
      .use(rehypeSanitize, sanitizeSchema)
      // MathML needs no CSS or fonts, Chromium renders it with the container's math font.
      .use(rehypeKatex, { output: 'mathml' })
      .use(rehypeDocument, {
        language: 'de',
        title,
        style: PDF_STYLES,
        responsive: false,
      })
      .use(rehypeStringify)
      .process(markdown),
  );
  return body;
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
