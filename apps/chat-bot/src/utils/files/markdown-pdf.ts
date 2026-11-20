import type { Root } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { activateLivePlots } from '@/components/chat/plot/live-plots';
import { getPlotKey } from '@/components/chat/plot/rendered-plots';
import { PLOT_LANGUAGE } from '@/utils/code-blocks';
import { parsePlotSpec } from '@/utils/plot/plot-spec';

import { type DocumentImageReferences, loadDocumentImage } from './document-images';
import type { SharedChatDocumentContext } from './generated-document';
import { renderPlotImage, waitForPlotActivation } from './plot-image';

const MAX_PLOTS = 10;

function toBase64(data: ArrayBuffer) {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function renderPlots(markdown: string) {
  const root = unified().use(remarkParse).parse(markdown) as Root;
  const specs = new Map<string, NonNullable<ReturnType<typeof getValidSpec>>>();
  visit(root, 'code', (node) => {
    const spec = node.lang === PLOT_LANGUAGE ? getValidSpec(node.value) : undefined;
    if (spec !== undefined && specs.size < MAX_PLOTS) {
      specs.set(node.value, spec);
    }
  });
  if (specs.size === 0) {
    return [];
  }

  const restoreLivePlots = activateLivePlots(new Set([...specs.values()].map(getPlotKey)));
  try {
    await waitForPlotActivation();
    const plots = await Promise.all(
      [...specs].map(async ([code, spec]) => {
        const image = await renderPlotImage(spec);
        return image === undefined ? undefined : { code, data: toBase64(image.data) };
      }),
    );
    return plots.filter((plot) => plot !== undefined);
  } finally {
    restoreLivePlots();
  }
}

function getValidSpec(code: string) {
  const parsed = parsePlotSpec(code);
  return 'spec' in parsed ? parsed.spec : undefined;
}

export async function markdownToPdfBlob(
  markdown: string,
  imageReferences: DocumentImageReferences = new Map(),
  title = 'Generated document',
  sharedChat?: SharedChatDocumentContext,
): Promise<Blob> {
  const images = await Promise.all(
    [...imageReferences.entries()].map(async ([source, url]) => {
      const loadedImage = await loadDocumentImage(url);
      return { source, mimeType: loadedImage.mimeType, data: toBase64(loadedImage.data) };
    }),
  );
  const plots = await renderPlots(markdown);
  const response = await fetch(
    sharedChat === undefined
      ? '/api/generate-document/pdf'
      : '/api/v1/shared-chat/generate-document/pdf',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...sharedChat, markdown, title, images, plots }),
    },
  );

  if (!response.ok) {
    throw new Error(`PDF generation failed: ${response.status}`);
  }
  return response.blob();
}
