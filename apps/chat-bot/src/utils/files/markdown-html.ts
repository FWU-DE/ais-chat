import type { Root, RootContent } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import type { DocumentImageReferences } from './document-images';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Support both full HTML documents and embedded HTML code blocks within Markdown
function findFullHtmlSource(tree: Root) {
  const code = tree.children.find(
    (node): node is Extract<RootContent, { type: 'code' }> =>
      node.type === 'code' &&
      (node.lang === 'html' || node.lang === 'htm') &&
      /<!doctype\s+html|<html[\s>]/i.test(node.value),
  );
  return code?.value;
}

// Support both full HTML documents and embedded HTML code blocks within Markdown
function isCompleteHtml(source: string) {
  return /<!doctype\s+html|<html[\s>]/i.test(source);
}

async function prepareInteractiveHtml(
  source: string,
  imageReferences: DocumentImageReferences = new Map(),
): Promise<string> {
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  for (const image of Array.from(parsed.images)) {
    const sourceUrl = image.getAttribute('src');
    if (sourceUrl !== null) {
      image.setAttribute('src', imageReferences.get(sourceUrl) ?? sourceUrl);
    }
  }
  return `<!doctype html>\n${parsed.documentElement.outerHTML}`;
}

export async function markdownToHtmlBlob(
  markdown: string,
  title: string,
  imageReferences?: DocumentImageReferences,
): Promise<Blob> {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  const source = findFullHtmlSource(tree) ?? (isCompleteHtml(markdown) ? markdown : undefined);
  if (source === undefined) {
    throw new Error('HTML generation requires a complete HTML document.');
  }

  const preparedSource = await prepareInteractiveHtml(source, imageReferences);
  const wrapper = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>html, body { margin: 0; min-height: 100%; } iframe { display: block; width: 100%; min-height: 100vh; border: 0; }</style>
</head>
<body><iframe title="${escapeHtml(title)}" srcdoc="${escapeHtml(preparedSource)}"></iframe></body>
</html>`;

  return new Blob([wrapper], { type: 'text/html;charset=utf-8' });
}
