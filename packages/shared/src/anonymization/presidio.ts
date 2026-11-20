import { z } from 'zod';

import type { PiiEntity } from './types';

const presidioResponseSchema = z.array(
  z.object({
    entity_type: z.string(),
    start: z.number(),
    end: z.number(),
    score: z.number(),
  }),
);

/**
 * Detects PII entities with a presidio-analyzer instance
 * (https://microsoft.github.io/presidio/).
 *
 * Throws when the service is unreachable or responds with an error, so that callers
 * fail closed instead of silently skipping NER-based detection.
 */
export async function analyzeWithPresidio({
  text,
  url,
  language,
  timeoutMs = 15_000,
}: {
  text: string;
  url: string;
  language: string;
  timeoutMs?: number;
}): Promise<PiiEntity[]> {
  const response = await fetch(new URL('/analyze', url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Presidio analyzer request failed with status ${response.status}`);
  }

  const entities = presidioResponseSchema.parse(await response.json());
  return entities.map((entity) => ({
    type: entity.entity_type,
    start: entity.start,
    end: entity.end,
    score: entity.score,
  }));
}
