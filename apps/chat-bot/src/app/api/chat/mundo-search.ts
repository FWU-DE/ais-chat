import { logError } from '@shared/logging';
import { z } from 'zod';
import {
  MUNDO_CLASS_LEVELS,
  MUNDO_DETAILS_URL_PREFIX,
  MUNDO_SEARCH_DESCRIPTION_LENGTH_LIMIT,
  MUNDO_SEARCH_ENDPOINT,
  MUNDO_SEARCH_RESULTS_LIMIT,
  MUNDO_SEARCH_TIMEOUT_MS,
  MUNDO_SEARCH_TITLE_LENGTH_LIMIT,
  MUNDO_SUBJECTS,
} from '@/configuration-text-inputs/const';

const mundoSearchTileSchema = z.object({
  identifier: z.string().nullish(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  learnResourceType: z.array(z.string()).nullish(),
  language: z.array(z.string()).nullish(),
  source: z
    .object({
      name: z.string().nullish(),
    })
    .nullish(),
});

const mundoSearchApiResponseSchema = z.object({
  tiles: z.array(mundoSearchTileSchema).nullish(),
});

type MundoSearchTile = z.infer<typeof mundoSearchTileSchema>;

export type MundoSearchResult = {
  title: string;
  description: string;
  learnResourceType: string[];
  language: string[];
  url: string;
  source: string;
};

type MundoClassLevel = (typeof MUNDO_CLASS_LEVELS)[number];
type MundoSubject = (typeof MUNDO_SUBJECTS)[number];

function truncate(value: string | null | undefined, limit: number): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.length === 0) return '';
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed;
}

function normalizeList(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((v) => v?.trim()).filter((v): v is string => !!v && v.length > 0);
}

function formatElement(element: MundoSearchTile): MundoSearchResult | null {
  const identifier = element.identifier?.trim();
  if (!identifier) return null;

  return {
    title: truncate(element.title, MUNDO_SEARCH_TITLE_LENGTH_LIMIT),
    description: truncate(element.description, MUNDO_SEARCH_DESCRIPTION_LENGTH_LIMIT),
    learnResourceType: normalizeList(element.learnResourceType),
    language: normalizeList(element.language),
    url: `${MUNDO_DETAILS_URL_PREFIX}${identifier}`,
    source: element.source?.name?.trim() ?? '',
  };
}

export function sanitizeClassLevel(value: unknown): MundoClassLevel | undefined {
  if (typeof value !== 'string') return undefined;
  return (MUNDO_CLASS_LEVELS as readonly string[]).includes(value)
    ? (value as MundoClassLevel)
    : undefined;
}

export function sanitizeSubject(value: unknown): MundoSubject | undefined {
  if (typeof value !== 'string') return undefined;
  return (MUNDO_SUBJECTS as readonly string[]).includes(value)
    ? (value as MundoSubject)
    : undefined;
}

export class MundoSearchError extends Error {
  name = 'MundoSearchError';
}

export async function mundoSearch({
  query,
  classLevel,
  subject,
}: {
  query: string;
  classLevel?: MundoClassLevel;
  subject?: MundoSubject;
}): Promise<MundoSearchResult[]> {
  let response: Response;
  try {
    response = await fetch(MUNDO_SEARCH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        search: query,
        filters: {
          classLevels: classLevel ? [classLevel] : [],
          subjects: subject ? [subject] : [],
        },
        size: MUNDO_SEARCH_RESULTS_LIMIT,
      }),
      signal: AbortSignal.timeout(MUNDO_SEARCH_TIMEOUT_MS),
    });
  } catch (error) {
    logError('Error during MUNDO search', error);
    throw new MundoSearchError();
  }

  if (!response.ok) {
    logError(`MUNDO search failed with status ${response.status}: ${response.statusText}`);
    throw new MundoSearchError();
  }

  const rawData: unknown = await response.json();
  const parsed = mundoSearchApiResponseSchema.safeParse(rawData);

  if (!parsed.success) {
    logError('MUNDO search response failed schema validation', parsed.error);
    throw new MundoSearchError();
  }

  const tiles = parsed.data.tiles ?? [];
  return tiles.map(formatElement).filter((result): result is MundoSearchResult => result !== null);
}
