import { z } from 'zod';

export const PERSONAL_CONTEXT_MAX_CHARS = 8000;
export const PERSONAL_CONTEXT_MAX_ENTRIES = 60;
export const PERSONAL_CONTEXT_MAX_ENTRY_CHARS = 300;

/**
 * Sections the extraction model is allowed to write into. Users may add their own
 * headings when editing manually; those are preserved but never targeted by operations.
 */
export const PERSONAL_CONTEXT_SECTIONS = [
  'Über mich',
  'Arbeitsweise und Präferenzen',
  'Schule und Unterricht',
  'Sonstiges',
] as const;

export type PersonalContextSection = (typeof PERSONAL_CONTEXT_SECTIONS)[number];

const DEFAULT_SECTION: PersonalContextSection = 'Sonstiges';

export const personalContextOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add'),
    section: z.enum(PERSONAL_CONTEXT_SECTIONS),
    text: z.string().min(1),
  }),
  z.object({
    op: z.literal('update'),
    text: z.string().min(1),
    replaces: z.string().min(1),
  }),
  z.object({
    op: z.literal('remove'),
    replaces: z.string().min(1),
  }),
]);

export type PersonalContextOperation = z.infer<typeof personalContextOperationSchema>;

export type PersonalContextEntry = {
  section: string;
  text: string;
};

export type PersonalContextDocument = {
  /** Content that appears before the first heading — preserved verbatim. */
  preamble: string;
  sections: { heading: string; entries: string[] }[];
};

const HEADING_PATTERN = /^#{1,6}\s+(.*)$/;
const BULLET_PATTERN = /^\s*[-*]\s+(.*)$/;

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function parsePersonalContext(markdown: string): PersonalContextDocument {
  const document: PersonalContextDocument = { preamble: '', sections: [] };
  const preambleLines: string[] = [];

  for (const line of markdown.split('\n')) {
    const headingMatch = line.match(HEADING_PATTERN);

    if (headingMatch?.[1] !== undefined) {
      const heading = headingMatch[1].trim();

      // The document title is not a content section
      if (document.sections.length === 0 && line.startsWith('# ')) {
        continue;
      }

      document.sections.push({ heading, entries: [] });
      continue;
    }

    const bulletMatch = line.match(BULLET_PATTERN);
    const currentSection = document.sections[document.sections.length - 1];

    if (bulletMatch?.[1] !== undefined && currentSection !== undefined) {
      const entry = bulletMatch[1].trim();

      if (entry.length > 0) {
        currentSection.entries.push(entry);
      }
      continue;
    }

    if (document.sections.length === 0 && line.trim().length > 0) {
      preambleLines.push(line);
    }
  }

  document.preamble = preambleLines.join('\n').trim();

  return document;
}

export function serializePersonalContext(document: PersonalContextDocument): string {
  const parts: string[] = [];

  if (document.preamble.length > 0) {
    parts.push(document.preamble);
  }

  for (const section of document.sections) {
    if (section.entries.length === 0) {
      continue;
    }

    parts.push(`## ${section.heading}\n${section.entries.map((entry) => `- ${entry}`).join('\n')}`);
  }

  return parts.join('\n\n').trim();
}

export function countEntries(document: PersonalContextDocument): number {
  return document.sections.reduce((total, section) => total + section.entries.length, 0);
}

function findEntry(
  document: PersonalContextDocument,
  needle: string,
): { sectionIndex: number; entryIndex: number } | undefined {
  const normalizedNeedle = normalizeForComparison(needle);

  for (const [sectionIndex, section] of document.sections.entries()) {
    const entryIndex = section.entries.findIndex(
      (entry) => normalizeForComparison(entry) === normalizedNeedle,
    );

    if (entryIndex !== -1) {
      return { sectionIndex, entryIndex };
    }
  }

  // Fall back to a containment match so the model does not need to quote verbatim
  for (const [sectionIndex, section] of document.sections.entries()) {
    const entryIndex = section.entries.findIndex((entry) => {
      const normalizedEntry = normalizeForComparison(entry);

      return (
        normalizedEntry.includes(normalizedNeedle) || normalizedNeedle.includes(normalizedEntry)
      );
    });

    if (entryIndex !== -1) {
      return { sectionIndex, entryIndex };
    }
  }

  return undefined;
}

function ensureSection(document: PersonalContextDocument, heading: string): number {
  const existingIndex = document.sections.findIndex(
    (section) => normalizeForComparison(section.heading) === normalizeForComparison(heading),
  );

  if (existingIndex !== -1) {
    return existingIndex;
  }

  document.sections.push({ heading, entries: [] });

  return document.sections.length - 1;
}

function sanitizeEntryText(text: string): string {
  // Collapse to a single line so one entry can never forge additional bullets or headings
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[-*#\s]+/, '')
    .trim()
    .slice(0, PERSONAL_CONTEXT_MAX_ENTRY_CHARS);
}

function entryExists(document: PersonalContextDocument, text: string): boolean {
  const normalized = normalizeForComparison(text);

  return document.sections.some((section) =>
    section.entries.some((entry) => normalizeForComparison(entry) === normalized),
  );
}

/**
 * Applies extraction operations to the document. Operations are applied
 * deterministically in code rather than letting the model rewrite the whole
 * document, so manually authored content cannot be silently destroyed.
 */
export function applyPersonalContextOperations({
  markdown,
  operations,
}: {
  markdown: string;
  operations: PersonalContextOperation[];
}): { content: string; changed: boolean } {
  const document = parsePersonalContext(markdown);
  let changed = false;

  for (const operation of operations) {
    if (operation.op === 'remove') {
      const location = findEntry(document, operation.replaces);

      if (location === undefined) {
        continue;
      }

      document.sections[location.sectionIndex]?.entries.splice(location.entryIndex, 1);
      changed = true;
      continue;
    }

    const text = sanitizeEntryText(operation.text);

    if (text.length === 0) {
      continue;
    }

    if (operation.op === 'update') {
      const location = findEntry(document, operation.replaces);

      if (location === undefined) {
        // The entry the model wanted to rewrite is gone — treat it as a new fact
        if (!entryExists(document, text) && countEntries(document) < PERSONAL_CONTEXT_MAX_ENTRIES) {
          const sectionIndex = ensureSection(document, DEFAULT_SECTION);
          document.sections[sectionIndex]?.entries.push(text);
          changed = true;
        }
        continue;
      }

      const section = document.sections[location.sectionIndex];

      if (section?.entries[location.entryIndex] === text) {
        continue;
      }

      section?.entries.splice(location.entryIndex, 1, text);
      changed = true;
      continue;
    }

    if (entryExists(document, text) || countEntries(document) >= PERSONAL_CONTEXT_MAX_ENTRIES) {
      continue;
    }

    const sectionIndex = ensureSection(document, operation.section);
    document.sections[sectionIndex]?.entries.push(text);
    changed = true;
  }

  if (!changed) {
    return { content: markdown, changed: false };
  }

  return {
    content: serializePersonalContext(document).slice(0, PERSONAL_CONTEXT_MAX_CHARS),
    changed: true,
  };
}
