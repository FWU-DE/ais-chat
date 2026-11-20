import type { PiiEntity } from './types';

const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// German-centric phone numbers: +49/0049 or a national 0-prefix, followed by an area
// code (optionally in parentheses) and the subscriber number. Spaces, dashes and
// slashes are allowed as separators. Requires at least 8 digits overall to avoid
// matching short numeric values.
const PHONE_REGEX = /(?:\+49|0049|0)[\s\-/]?(?:\(\d{2,5}\)|\d{2,5})[\s\-/]?\d(?:[\s\-/]?\d){5,10}/g;

const IBAN_REGEX = /\b[A-Z]{2}\d{2}(?: ?[A-Za-z0-9]{4}){2,7}(?: ?[A-Za-z0-9]{1,3})?\b/g;

/** Validates an IBAN candidate with the MOD-97 checksum (ISO 13616). */
export function isValidIban(candidate: string): boolean {
  const iban = candidate.replace(/\s+/g, '').toUpperCase();
  if (iban.length < 15 || iban.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const value = char >= 'A' && char <= 'Z' ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of value) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

function matchAll({
  text,
  regex,
  type,
  score,
  validate,
}: {
  text: string;
  regex: RegExp;
  type: string;
  score: number;
  validate?: (match: string) => boolean;
}): PiiEntity[] {
  const entities: PiiEntity[] = [];
  for (const match of text.matchAll(regex)) {
    if (validate && !validate(match[0])) continue;
    entities.push({ type, start: match.index, end: match.index + match[0].length, score });
  }
  return entities;
}

/**
 * Detects structured PII (e-mail addresses, German phone numbers, IBANs) with
 * pattern matching. Person names cannot be detected this way — that requires the
 * optional Presidio analyzer (see presidio.ts).
 */
export function recognizePiiEntities(text: string): PiiEntity[] {
  return [
    ...matchAll({ text, regex: EMAIL_REGEX, type: 'EMAIL_ADDRESS', score: 1 }),
    ...matchAll({ text, regex: PHONE_REGEX, type: 'PHONE_NUMBER', score: 0.6 }),
    ...matchAll({ text, regex: IBAN_REGEX, type: 'IBAN_CODE', score: 1, validate: isValidIban }),
  ];
}
