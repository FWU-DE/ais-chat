import { describe, expect, it } from 'vitest';

import { AiGenerationError } from '../../errors';
import { buildSsmlSegments, getVoiceLocale } from './segments';

const VOICE = 'de-DE-Seraphina:DragonHDLatestNeural';
const SPEAK_OPEN =
  '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ' +
  'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="de-DE">' +
  `<voice name="${VOICE}">`;
const SPEAK_CLOSE = '</voice></speak>';

function build(body: string, maxChars = 10_000, voice = VOICE) {
  return buildSsmlSegments({ body, voice, maxChars });
}

function expectInvalidSsml(body: string, message: string | RegExp) {
  expect(() => build(body)).toThrow(AiGenerationError);
  expect(() => build(body)).toThrow(message);
}

describe('getVoiceLocale', () => {
  it.each([
    ['de-DE-Seraphina:DragonHDLatestNeural', 'de-DE'],
    ['en-US-Grant:MAI-Voice-2.1-Flash', 'en-US'],
    ['fil-PH-Angelo', 'fil-PH'],
  ])('derives the locale from %s', (voice, locale) => {
    expect(getVoiceLocale(voice)).toBe(locale);
  });

  it.each(['alloy', 'de-Seraphina', 'DE-de-Seraphina', ''])(
    'falls back to de-DE for %j',
    (voice) => {
      expect(getVoiceLocale(voice)).toBe('de-DE');
    },
  );
});

describe('buildSsmlSegments', () => {
  describe('wrapping', () => {
    it('wraps the body in a speak document with the voice and its locale', () => {
      expect(build('<lang xml:lang="de-DE"><p>Hallo Welt</p></lang>')).toEqual([
        `${SPEAK_OPEN}<lang xml:lang="de-DE"><p>Hallo Welt</p></lang>${SPEAK_CLOSE}`,
      ]);
    });

    it('uses the voice locale for the speak element, independent of the detected language', () => {
      const [segment] = build(
        '<lang xml:lang="fr-FR"><p>Bonjour</p></lang>',
        10_000,
        'en-US-Grant:MAI-Voice-2.1-Flash',
      );

      expect(segment).toContain('<speak version="1.0"');
      expect(segment).toContain('xml:lang="en-US"><voice name="en-US-Grant:MAI-Voice-2.1-Flash">');
      expect(segment).toContain('<lang xml:lang="fr-FR"><p>Bonjour</p></lang>');
    });

    it('escapes the voice name in the voice attribute', () => {
      const [segment] = build('<p>Hallo</p>', 10_000, 'de-DE-a"b<c>&d');

      expect(segment).toContain('<voice name="de-DE-a&quot;b&lt;c&gt;&amp;d">');
    });

    it('accepts a body without lang wrapper and plain text', () => {
      expect(build('<p>Eins</p><p>Zwei</p>')).toEqual([
        `${SPEAK_OPEN}<p>Eins</p><p>Zwei</p>${SPEAK_CLOSE}`,
      ]);
      expect(build('Nur Text')).toEqual([`${SPEAK_OPEN}Nur Text${SPEAK_CLOSE}`]);
    });

    it('keeps escaped characters, nested language switches and other SSML elements', () => {
      const body =
        '<lang xml:lang="de-DE"><p>A &amp; B &lt; C</p>' +
        '<p>Das ist <lang xml:lang="en-US">great</lang>.<break time="1s"/></p>' +
        '<p><emphasis level="moderate">Wichtig</emphasis> <say-as interpret-as="date">2026-11-20</say-as></p></lang>';

      const [segment] = build(body);

      expect(segment).toContain('<p>A &amp; B &lt; C</p>');
      expect(segment).toContain('<lang xml:lang="en-US">great</lang>');
      expect(segment).toContain('<break time="1s"/>');
      expect(segment).toContain('<emphasis level="moderate">Wichtig</emphasis>');
      expect(segment).toContain('<say-as interpret-as="date">2026-11-20</say-as>');
    });

    it('accepts mstts elements without a namespace declaration in the body', () => {
      const [segment] = build('<p>Pause<mstts:silence type="Tailing" value="200ms"/></p>');

      expect(segment).toContain('<mstts:silence type="Tailing" value="200ms"');
    });

    it('ignores whitespace between top-level blocks', () => {
      expect(build('\n  <p>Eins</p>\n\n  <p>Zwei</p>\n')).toEqual([
        `${SPEAK_OPEN}<p>Eins</p><p>Zwei</p>${SPEAK_CLOSE}`,
      ]);
    });
  });

  describe('validation', () => {
    it.each([
      ['an unclosed element', '<p>Hallo'],
      ['mismatched tags', '<p>Hallo</s>'],
      ['an unknown entity', '<p>a &nbsp; b</p>'],
      ['an unbound namespace prefix', '<p><foo:bar/></p>'],
    ])('rejects %s', (_case, body) => {
      expectInvalidSsml(body, /^Invalid SSML/);
    });

    it('escapes a stray ampersand instead of rejecting the body', () => {
      expect(build('<p>A & B</p>')).toEqual([`${SPEAK_OPEN}<p>A &amp; B</p>${SPEAK_CLOSE}`]);
    });

    it.each([
      ['speak', '<speak><p>Hallo</p></speak>'],
      ['voice', '<voice name="other">Hallo</voice>'],
      ['audio', '<p>Hallo <audio src="https://example.com/a.mp3"/></p>'],
      ['mstts:backgroundaudio', '<mstts:backgroundaudio src="https://example.com/a.mp3"/>'],
    ])('rejects the forbidden element <%s>, also when nested', (element, body) => {
      expectInvalidSsml(
        `<lang xml:lang="de-DE">${body}</lang>`,
        `Invalid SSML: element <${element}> is not allowed`,
      );
    });

    it.each([
      ['an empty body', ''],
      ['a whitespace-only body', ' \n '],
      ['an empty lang wrapper', '<lang xml:lang="de-DE">  </lang>'],
    ])('rejects %s', (_case, body) => {
      expectInvalidSsml(body, 'Invalid SSML: no content to synthesize');
    });
  });

  describe('splitting', () => {
    const blockA = `<p>${'a'.repeat(40)}</p>`;
    const blockB = `<p>${'b'.repeat(40)}</p>`;
    const blockC = `<p>${'c'.repeat(40)}</p>`;
    const langOpen = '<lang xml:lang="de-DE">';
    const overhead = `${SPEAK_OPEN}${langOpen}</lang>${SPEAK_CLOSE}`.length;

    it('returns a single segment when everything fits', () => {
      const segments = build(`${langOpen}${blockA}${blockB}${blockC}</lang>`);

      expect(segments).toEqual([
        `${SPEAK_OPEN}${langOpen}${blockA}${blockB}${blockC}</lang>${SPEAK_CLOSE}`,
      ]);
    });

    it('splits between blocks and repeats the outer lang wrapper in every segment', () => {
      const maxChars = overhead + 2 * blockA.length;

      const segments = build(`${langOpen}${blockA}${blockB}${blockC}</lang>`, maxChars);

      expect(segments).toEqual([
        `${SPEAK_OPEN}${langOpen}${blockA}${blockB}</lang>${SPEAK_CLOSE}`,
        `${SPEAK_OPEN}${langOpen}${blockC}</lang>${SPEAK_CLOSE}`,
      ]);
    });

    it('keeps every segment within the limit', () => {
      const blocks = Array.from({ length: 20 }, (_, i) => `<p>Satz ${i} ${'x'.repeat(i * 3)}</p>`);
      const maxChars = overhead + 120;

      const segments = build(`${langOpen}${blocks.join('')}</lang>`, maxChars);

      expect(segments.length).toBeGreaterThan(1);
      for (const segment of segments) {
        expect(segment.length).toBeLessThanOrEqual(maxChars);
        expect(segment.startsWith(`${SPEAK_OPEN}${langOpen}`)).toBe(true);
        expect(segment.endsWith(`</lang>${SPEAK_CLOSE}`)).toBe(true);
      }
      expect(segments.join('')).toContain('Satz 19');
    });

    it('allows a segment of exactly the limit', () => {
      const maxChars = overhead + blockA.length;

      const segments = build(`${langOpen}${blockA}${blockB}</lang>`, maxChars);

      expect(segments).toHaveLength(2);
      expect(segments[0]).toHaveLength(maxChars);
    });

    it('splits top-level blocks when there is no single lang wrapper', () => {
      const plainOverhead = `${SPEAK_OPEN}${SPEAK_CLOSE}`.length;

      const segments = build(`${blockA}${blockB}`, plainOverhead + blockA.length);

      expect(segments).toEqual([
        `${SPEAK_OPEN}${blockA}${SPEAK_CLOSE}`,
        `${SPEAK_OPEN}${blockB}${SPEAK_CLOSE}`,
      ]);
    });

    it('does not split inside a lang wrapper that is followed by other content', () => {
      const body = `${langOpen}${blockA}${blockB}</lang>${blockC}`;
      const firstBlock = `${langOpen}${blockA}${blockB}</lang>`;
      const plainOverhead = `${SPEAK_OPEN}${SPEAK_CLOSE}`.length;

      const segments = build(body, plainOverhead + firstBlock.length);

      expect(segments).toEqual([
        `${SPEAK_OPEN}${firstBlock}${SPEAK_CLOSE}`,
        `${SPEAK_OPEN}${blockC}${SPEAK_CLOSE}`,
      ]);
    });

    it('rejects a single block that exceeds the limit', () => {
      const maxChars = overhead + blockA.length - 1;

      expect(() => build(`${langOpen}${blockA}</lang>`, maxChars)).toThrow(
        `Invalid SSML: a single block exceeds the segment limit of ${maxChars} characters`,
      );
    });
  });
});
