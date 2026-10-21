import { type AiActivityLink } from '@/types/ai-activity';

// Parsing helpers for tool arguments/results, used by the individual tool files.

const MAX_DETAIL_LENGTH = 300;
const MAX_LINKS = 10;

export function parseJsonRecord(value: string | undefined): unknown {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function truncate(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value.length > MAX_DETAIL_LENGTH ? `${value.slice(0, MAX_DETAIL_LENGTH)}…` : value;
}

export type LinkEntry = {
  url?: string | null;
  title?: string | null;
  error?: string | null;
};

export function toLinks(entries: LinkEntry[]): AiActivityLink[] | undefined {
  const links = entries
    .map((entry) => {
      const url = entry.url?.trim();
      if (!url) {
        return undefined;
      }

      try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          return undefined;
        }

        const title = entry.title?.trim();
        return {
          title: title ? title : url,
          url: parsedUrl.toString(),
          ...(entry.error && { failed: true }),
        };
      } catch {
        return undefined;
      }
    })
    .filter((link): link is AiActivityLink => link !== undefined)
    .slice(0, MAX_LINKS);

  return links.length > 0 ? links : undefined;
}
