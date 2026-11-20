/**
 * A detected PII entity as a character span within a text.
 * Entity type names follow the Presidio convention (e.g. PERSON, EMAIL_ADDRESS).
 */
export type PiiEntity = {
  type: string;
  start: number;
  end: number;
  score: number;
};

export type AnonymizationMode = 'placeholder' | 'pseudonym';
