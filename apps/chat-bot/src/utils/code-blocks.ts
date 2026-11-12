import MarkdownIt from 'markdown-it';

import {
  GENERATED_DOCUMENT_FORMATS,
  type GeneratedDocumentFormat,
} from '@/utils/files/generated-document';

// Language of fenced code blocks that are rendered as JSXGraph plots.
export const PLOT_LANGUAGE = 'jsxgraph-json';
export const DOCUMENT_LANGUAGE = 'document';

const md = new MarkdownIt();
const TITLE_PATTERN = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)')/;
const FORMAT_PATTERN = /(?:^|\s)format=(?:"([^"]*)"|'([^']*)')/;
const MARKDOWN_TITLE_PATTERN = /^\s*#\s+(.+)$/m;

// The fence info string (`js title="Titel"`) is split by the markdown libraries,
// only the `title="…"` attribute (the common docs convention) is read from it.
export function getCodeTitle(meta: string | null | undefined) {
  const match = meta ? TITLE_PATTERN.exec(meta) : null;
  const title = (match?.[1] ?? match?.[2])?.trim();
  return title || undefined;
}

export type GeneratedDocumentMarkdown = {
  content: string;
  title?: string;
  format: GeneratedDocumentFormat;
};

export function extractDocumentBlocks(markdown: string): GeneratedDocumentMarkdown[] {
  return md
    .parse(markdown, {})
    .filter(
      (token) => token.type === 'fence' && token.info.trim().split(/\s+/)[0] === DOCUMENT_LANGUAGE,
    )
    .map((token) => {
      const formatMatch = FORMAT_PATTERN.exec(token.info);
      const requestedFormat = (formatMatch?.[1] ?? formatMatch?.[2])?.toLowerCase();
      return {
        content: token.content,
        title: getCodeTitle(token.info) ?? MARKDOWN_TITLE_PATTERN.exec(token.content)?.[1]?.trim(),
        format: GENERATED_DOCUMENT_FORMATS.find((format) => format === requestedFormat) ?? 'docx',
      };
    });
}

export function removeDocumentBlocks(markdown: string): string {
  const fences = md
    .parse(markdown, {})
    .filter(
      (token) => token.type === 'fence' && token.info.trim().split(/\s+/)[0] === DOCUMENT_LANGUAGE,
    );
  if (fences.length === 0) return markdown;

  const lines = markdown.split('\n');
  for (const token of fences.reverse()) {
    if (token.map !== null) {
      const firstLine = lines[token.map[0]] ?? '';
      const prefix = firstLine.slice(0, firstLine.indexOf(token.markup));
      lines.splice(token.map[0], token.map[1] - token.map[0], prefix);
    }
  }
  return lines.join('\n');
}

export function removeGeneratedDocumentLinks(markdown: string): string {
  return markdown
    .replace(/^\s*[-*]\s+\[[^\]]+\b(?:DOCX|PDF|Word-Datei|PDF-Datei)\b[^\]]*\]\([^)]*\)\s*$/gim, '')
    .replace(/^\s*[-*]\s+\[[^\]]+(?:Word|PDF)[^\]]*herunterladen[^\]]*\]\([^)]*\)\s*$/gim, '')
    .replace(/\[([^\]]+\.(?:docx|pdf))\]\([^)]*\)/gi, '$1');
}

export function removeGeneratedDocumentImages(markdown: string): string {
  return markdown.replace(/^\s*!\[[^\]]*\]\([^)]*\)\s*$/gim, '');
}

// Replaces ```jsxgraph-json blocks with a plain-text description, e.g. for copying or reading aloud.
export function replacePlotBlocks(markdown: string, describe: (title?: string) => string) {
  const plotFences = md
    .parse(markdown, {})
    .filter(
      (token) => token.type === 'fence' && token.info.trim().split(/\s+/)[0] === PLOT_LANGUAGE,
    );
  if (plotFences.length === 0) {
    return markdown;
  }

  const lines = markdown.split('\n');
  for (const token of plotFences.reverse()) {
    if (token.map !== null) {
      // The fence's first line may carry a list/blockquote prefix (e.g. `- ` or `> `) before
      // its markup; keep it so the description stays inside the same container.
      const firstLine = lines[token.map[0]] ?? '';
      const prefix = firstLine.slice(0, firstLine.indexOf(token.markup));
      lines.splice(
        token.map[0],
        token.map[1] - token.map[0],
        prefix + describe(getCodeTitle(token.info)),
      );
    }
  }
  return lines.join('\n');
}
