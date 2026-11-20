import type { Language } from 'linguist-languages';
import MarkdownIt from 'markdown-it';

// Language of fenced code blocks that are rendered as JSXGraph plots.
export const PLOT_LANGUAGE = 'jsxgraph-json';

const md = new MarkdownIt();
const TITLE_PATTERN = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)')/;

// The fence info string (`js title="Titel"`) is split by the markdown libraries,
// only the `title="…"` attribute (the common docs convention) is read from it.
export function getCodeTitle(meta: string | null | undefined) {
  const match = meta ? TITLE_PATTERN.exec(meta) : null;
  const title = (match?.[1] ?? match?.[2])?.trim();
  return title || undefined;
}

const FALLBACK_EXTENSION = '.txt';
const FALLBACK_FILE_NAME = 'code';
// Browsers sanitize the name of a download, but Chromium silently saves nothing above ~245 bytes.
const MAX_FILE_NAME_BYTES = 200;

type LanguageIndex = {
  extensions: Set<string>;
  fileNames: Set<string>;
  primaryExtensions: Map<string, string>;
};

let languageIndex: Promise<LanguageIndex> | undefined;

// Built from the Linguist data on first use; the data is only loaded when a download is requested.
function getLanguageIndex() {
  languageIndex ??= import('linguist-languages').then((languages) => {
    const index: LanguageIndex = {
      extensions: new Set(),
      fileNames: new Set(),
      primaryExtensions: new Map(),
    };
    for (const language of Object.values(languages) as readonly Language[]) {
      language.extensions?.forEach((extension) => index.extensions.add(extension.toLowerCase()));
      language.filenames?.forEach((fileName) => index.fileNames.add(fileName.toLowerCase()));
      const primaryExtension = language.extensions?.[0];
      if (primaryExtension !== undefined) {
        const names = [language.name, ...(language.aliases ?? [])];
        names.forEach((name) => {
          const key = name.toLowerCase();
          if (!index.primaryExtensions.has(key)) index.primaryExtensions.set(key, primaryExtension);
        });
      }
    }
    return index;
  });
  languageIndex.catch(() => {
    languageIndex = undefined;
  });
  return languageIndex;
}

function getExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex === -1 ? '' : fileName.slice(dotIndex);
}

function isKnownFileName(index: LanguageIndex, fileName: string) {
  const lowerCased = fileName.toLowerCase();
  return index.fileNames.has(lowerCased) || index.extensions.has(getExtension(lowerCased));
}

function getLanguageExtension(index: LanguageIndex, language: string | undefined) {
  const token = language?.toLowerCase();
  if (token === undefined) return FALLBACK_EXTENSION;
  const extension = index.primaryExtensions.get(token) ?? `.${token}`;
  return extension === FALLBACK_EXTENSION || index.extensions.has(extension)
    ? extension
    : FALLBACK_EXTENSION;
}

function limitByteLength(fileName: string) {
  const encoder = new TextEncoder();
  if (encoder.encode(fileName).length <= MAX_FILE_NAME_BYTES) return fileName;

  const extension = getExtension(fileName);
  const stem = Array.from(fileName.slice(0, fileName.length - extension.length));
  while (encoder.encode(stem.join('') + extension).length > MAX_FILE_NAME_BYTES) stem.pop();
  return stem.join('') + extension;
}

// A title that is a known file name is used as is, any other title gets the extension of the
// code block's language, without a title the name is generic.
export async function getCodeFileName({ language, title }: { language?: string; title?: string }) {
  const index = await getLanguageIndex();
  const extension = getLanguageExtension(index, language);

  if (title === undefined) {
    return `${FALLBACK_FILE_NAME}${extension}`;
  }
  return limitByteLength(isKnownFileName(index, title) ? title : `${title}${extension}`);
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
