const SENTENCE_SEGMENTER = new Intl.Segmenter('de', { granularity: 'sentence' });

// Ordered from most to least preferred break point; each keeps its separators so pieces rejoin losslessly.
const SPLITTERS: ((text: string) => string[])[] = [
  (text) => text.split(/(?<=\n[^\S\n]*\n)/),
  (text) => Array.from(SENTENCE_SEGMENTER.segment(text), ({ segment }) => segment),
  (text) => text.split(/(?<=\s)/),
];

function hardCut(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let current = '';
  // Iterating code points avoids cutting surrogate pairs apart.
  for (const char of text) {
    if (current.length + char.length > maxChars && current) {
      pieces.push(current);
      current = '';
    }
    current += char;
  }
  if (current) pieces.push(current);
  return pieces;
}

function splitIntoPieces(text: string, maxChars: number, level: number): string[] {
  if (text.length <= maxChars) return [text];

  const split = SPLITTERS[level];
  if (!split) return hardCut(text, maxChars);

  return split(text).flatMap((piece) => splitIntoPieces(piece, maxChars, level + 1));
}

/**
 * Splits text into segments of at most `maxChars` characters, breaking at paragraphs first,
 * then sentences, then words, and only cutting inside a word as a last resort.
 */
export function splitSpeechText(text: string, maxChars: number): string[] {
  const segments: string[] = [];
  let current = '';

  for (const piece of splitIntoPieces(text, maxChars, 0)) {
    if (current.length + piece.length > maxChars) {
      segments.push(current);
      current = '';
    }
    current += piece;
  }
  segments.push(current);

  return segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
}
