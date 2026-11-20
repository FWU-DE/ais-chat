import { analyzeWithPresidio } from './presidio';
import { recognizePiiEntities } from './recognizers';
import type { AnonymizationMode, PiiEntity } from './types';

const PLACEHOLDERS: Record<string, string> = {
  PERSON: '[PERSON]',
  LOCATION: '[ORT]',
  EMAIL_ADDRESS: '[E-MAIL]',
  PHONE_NUMBER: '[TELEFONNUMMER]',
  IBAN_CODE: '[IBAN]',
  ORGANIZATION: '[ORGANISATION]',
};

/**
 * Entity types that are replaced by default. Aggressive types like DATE_TIME are
 * excluded because dates are often relevant content (e.g. in pedagogical texts).
 */
export const DEFAULT_ENTITY_TYPES = [
  'PERSON',
  'EMAIL_ADDRESS',
  'PHONE_NUMBER',
  'IBAN_CODE',
  'LOCATION',
];

const PSEUDONYM_POOL = [
  'Alex',
  'Bella',
  'Chris',
  'Dana',
  'Elif',
  'Finn',
  'Grete',
  'Hannes',
  'Ida',
  'Jonas',
  'Kim',
  'Lena',
  'Mika',
  'Nora',
  'Oskar',
  'Pia',
  'Robin',
  'Sana',
  'Tessa',
  'Yuna',
];

/** FNV-1a hash for deterministic pseudonym selection. */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Maps an original name deterministically to a pseudonym, so the same name receives
 * the same pseudonym across messages without a stored mapping table.
 */
function pseudonymFor(original: string): string {
  const normalized = original.trim().toLowerCase();
  return PSEUDONYM_POOL[fnv1a(normalized) % PSEUDONYM_POOL.length]!;
}

/**
 * Resolves overlapping detections: higher score wins, ties go to the longer span.
 */
function resolveOverlaps(entities: PiiEntity[]): PiiEntity[] {
  const sorted = [...entities].sort(
    (a, b) => b.score - a.score || b.end - b.start - (a.end - a.start),
  );

  const kept: PiiEntity[] = [];
  for (const entity of sorted) {
    const overlaps = kept.some((other) => entity.start < other.end && other.start < entity.end);
    if (!overlaps) kept.push(entity);
  }

  return kept.sort((a, b) => a.start - b.start);
}

/** Replaces the given entity spans within the text. */
export function applyEntities({
  text,
  entities,
  mode,
}: {
  text: string;
  entities: PiiEntity[];
  mode: AnonymizationMode;
}): string {
  const resolved = resolveOverlaps(entities);

  let result = '';
  let cursor = 0;
  for (const entity of resolved) {
    result += text.slice(cursor, entity.start);

    const original = text.slice(entity.start, entity.end);
    result +=
      mode === 'pseudonym' && entity.type === 'PERSON'
        ? pseudonymFor(original)
        : (PLACEHOLDERS[entity.type] ?? `[${entity.type}]`);

    cursor = entity.end;
  }
  result += text.slice(cursor);

  return result;
}

/**
 * Detects and replaces PII in a text.
 *
 * Always applies the built-in pattern recognizers; when `presidioUrl` is set, results
 * of a presidio-analyzer instance (NER-based, detects person names) are merged in.
 * Presidio failures propagate so callers fail closed.
 */
export async function anonymizeText({
  text,
  mode = 'placeholder',
  presidioUrl,
  language = 'de',
  entityTypes = DEFAULT_ENTITY_TYPES,
  scoreThreshold = 0.4,
}: {
  text: string;
  mode?: AnonymizationMode;
  presidioUrl?: string;
  language?: string;
  entityTypes?: string[];
  scoreThreshold?: number;
}): Promise<string> {
  if (text.trim() === '') return text;

  const entities = recognizePiiEntities(text);
  if (presidioUrl !== undefined) {
    entities.push(...(await analyzeWithPresidio({ text, url: presidioUrl, language })));
  }

  const relevantEntities = entities.filter(
    (entity) => entityTypes.includes(entity.type) && entity.score >= scoreThreshold,
  );

  return applyEntities({ text, entities: relevantEntities, mode });
}
