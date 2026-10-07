import MarkdownIt from 'markdown-it';

// Language of fenced code blocks that are rendered as JSXGraph plots.
export const PLOT_LANGUAGE = 'jsxgraph-json';

const md = new MarkdownIt();
const TITLE_PATTERN = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)')/;

// The fence info string (`js title="Titel"`) is split by the markdown libraries,
// only the `title="…"` attribute (the common docs convention) is read from it.
export function getCodeTitle(meta: string | undefined) {
  const match = meta === undefined ? null : TITLE_PATTERN.exec(meta);
  const title = (match?.[1] ?? match?.[2])?.trim();
  return title || undefined;
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
      lines.splice(token.map[0], token.map[1] - token.map[0], describe(getCodeTitle(token.info)));
    }
  }
  return lines.join('\n');
}
