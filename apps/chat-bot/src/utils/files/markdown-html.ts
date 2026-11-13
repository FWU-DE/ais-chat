import type { Root, RootContent } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import {
  type AllowedDocumentImages,
  findAllowedImageUrl,
  loadDocumentImage,
} from './document-images';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function findFullHtmlSource(tree: Root) {
  const code = tree.children.find(
    (node): node is Extract<RootContent, { type: 'code' }> =>
      node.type === 'code' &&
      (node.lang === 'html' || node.lang === 'htm') &&
      /<!doctype\s+html|<html[\s>]/i.test(node.value),
  );
  return code?.value;
}

function isCompleteHtml(source: string) {
  return /<!doctype\s+html|<html[\s>]/i.test(source);
}

async function prepareInteractiveHtml(
  source: string,
  allowedImages: AllowedDocumentImages,
): Promise<string> {
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  // Security: Remove embedding and external resource primitives before preserving inline application code.
  parsed.querySelectorAll('iframe, object, embed, base, link, script[src]').forEach((element) => {
    element.remove();
  });

  for (const element of Array.from(parsed.querySelectorAll('*'))) {
    const href = element.getAttribute('href');
    // Security: Block external navigation and requests while keeping in-app hash links.
    if (href !== null && !href.startsWith('#')) {
      element.removeAttribute('href');
    }

    const inlineStyle = element.getAttribute('style');
    if (inlineStyle !== null) {
      // Security: CSS URLs and expression() can reintroduce network access or script execution.
      element.setAttribute(
        'style',
        inlineStyle.replace(/url\s*\([^)]*\)|expression\s*\([^)]*\)/gi, ''),
      );
    }
  }

  for (const style of Array.from(parsed.querySelectorAll('style'))) {
    // Security: Preserve visual styling but remove imports, resource URLs, and executable CSS.
    style.textContent = (style.textContent ?? '').replace(
      /@import[^;]+;|url\s*\([^)]*\)|expression\s*\([^)]*\)/gi,
      '',
    );
  }

  for (const image of Array.from(parsed.images)) {
    const sourceUrl = image.getAttribute('src');
    const allowedUrl =
      sourceUrl === null ? undefined : findAllowedImageUrl(sourceUrl, allowedImages);
    if (allowedUrl === undefined) {
      // Security: Only images uploaded in the current chat may be embedded.
      image.remove();
      continue;
    }
    const loadedImage = await loadDocumentImage(allowedUrl);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(loadedImage.data)));
    image.src = `data:${loadedImage.mimeType};base64,${base64}`;
    image.removeAttribute('srcset');
  }

  const policy = parsed.createElement('meta');
  // Security: Restrict the isolated app to inline code/styles, approved data images, and no network.
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
  parsed.head.prepend(policy);

  return `<!doctype html>\n${parsed.documentElement.outerHTML}`;
}

export async function markdownToHtmlBlob(
  markdown: string,
  title: string,
  allowedImages: AllowedDocumentImages = new Map(),
): Promise<Blob> {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  const source = isCompleteHtml(markdown) ? markdown : findFullHtmlSource(tree);
  if (source === undefined) {
    throw new Error('HTML generation requires a complete HTML document.');
  }

  const preparedSource = await prepareInteractiveHtml(source, allowedImages);
  // Security: Isolate generated JavaScript from the downloaded document's top-level page and origin.
  const wrapper = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>html, body { margin: 0; min-height: 100%; } iframe { display: block; width: 100%; min-height: 100vh; border: 0; }</style>
</head>
<body><iframe title="${escapeHtml(title)}" sandbox="allow-scripts" srcdoc="${escapeHtml(preparedSource)}"></iframe></body>
</html>`;

  return new Blob([wrapper], { type: 'text/html;charset=utf-8' });
}
