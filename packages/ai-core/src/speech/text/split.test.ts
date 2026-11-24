import { describe, expect, it } from 'vitest';

import { splitSpeechText } from './split';

function expectWithinLimit(segments: string[], maxChars: number) {
  for (const segment of segments) {
    expect(segment.length).toBeLessThanOrEqual(maxChars);
  }
}

describe('splitSpeechText', () => {
  it('returns short text as a single trimmed segment', () => {
    expect(splitSpeechText('  Hallo Welt.  ', 100)).toEqual(['Hallo Welt.']);
  });

  it('returns no segments for whitespace-only text', () => {
    expect(splitSpeechText(' \n\n ', 100)).toEqual([]);
  });

  it('breaks at paragraph boundaries when paragraphs fit', () => {
    const first = 'A'.repeat(30);
    const second = 'B'.repeat(30);
    const third = 'C'.repeat(30);

    expect(splitSpeechText(`${first}\n\n${second}\n\n${third}`, 70)).toEqual([
      `${first}\n\n${second}`,
      third,
    ]);
  });

  it('breaks long paragraphs at German sentence boundaries', () => {
    const text = 'Das ist der erste Satz. Hier kommt der zweite Satz! Ist das der dritte Satz?';

    expect(splitSpeechText(text, 55)).toEqual([
      'Das ist der erste Satz. Hier kommt der zweite Satz!',
      'Ist das der dritte Satz?',
    ]);
  });

  it('breaks long paragraphs at English sentence boundaries', () => {
    const text = 'This is the first sentence. Here is the second one. And a third.';

    expect(splitSpeechText(text, 30)).toEqual([
      'This is the first sentence.',
      'Here is the second one.',
      'And a third.',
    ]);
  });

  it('breaks overly long sentences at word boundaries', () => {
    const text = 'eins zwei drei vier fünf sechs sieben acht neun zehn';
    const segments = splitSpeechText(text, 20);

    expectWithinLimit(segments, 20);
    expect(segments.join(' ')).toBe(text);
  });

  it('cuts inside a word only when a single word exceeds the limit', () => {
    const segments = splitSpeechText('x'.repeat(25), 10);

    expect(segments).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
  });

  it('does not cut surrogate pairs apart', () => {
    const segments = splitSpeechText('😀'.repeat(5), 3);

    expect(segments).toEqual(['😀', '😀', '😀', '😀', '😀']);
  });

  it('keeps all content of a long mixed text within the limit', () => {
    const paragraph = 'Ein Satz mit einigen Wörtern. '.repeat(40);
    const text = `${paragraph}\n\nKurz.\n\n${paragraph}`;
    const segments = splitSpeechText(text, 200);

    expectWithinLimit(segments, 200);
    expect(segments.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
  });
});
