import { describe, expect, it } from 'vitest';

import {
  buildExtractionWindow,
  PERSONAL_CONTEXT_EXCHANGE_INTERVAL,
  shouldRunPersonalContextExtraction,
} from './personal-context-extraction';

describe('shouldRunPersonalContextExtraction', () => {
  it('does not run before the first interval is complete', () => {
    for (let count = 1; count < PERSONAL_CONTEXT_EXCHANGE_INTERVAL; count++) {
      expect(shouldRunPersonalContextExtraction({ userMessageCount: count })).toBe(false);
    }
  });

  it('runs once the interval is reached', () => {
    expect(
      shouldRunPersonalContextExtraction({ userMessageCount: PERSONAL_CONTEXT_EXCHANGE_INTERVAL }),
    ).toBe(true);
  });

  it('runs again after each further interval', () => {
    expect(
      shouldRunPersonalContextExtraction({
        userMessageCount: PERSONAL_CONTEXT_EXCHANGE_INTERVAL * 3,
      }),
    ).toBe(true);
    expect(
      shouldRunPersonalContextExtraction({
        userMessageCount: PERSONAL_CONTEXT_EXCHANGE_INTERVAL * 3 + 1,
      }),
    ).toBe(false);
  });

  it('does not run on an empty conversation', () => {
    expect(shouldRunPersonalContextExtraction({ userMessageCount: 0 })).toBe(false);
  });
});

describe('buildExtractionWindow', () => {
  it('labels both speakers', () => {
    const window = buildExtractionWindow({
      messages: [
        { role: 'user', content: 'Ich unterrichte Mathematik' },
        { role: 'assistant', content: 'Gut zu wissen' },
      ],
    });

    expect(window).toBe('Lehrkraft: Ich unterrichte Mathematik\nAssistent: Gut zu wissen');
  });

  it('covers the turns that were skipped between runs', () => {
    const window = buildExtractionWindow({
      messages: [
        { role: 'user', content: 'Erste' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'Zweite' },
        { role: 'assistant', content: 'A2' },
        { role: 'user', content: 'Dritte' },
        { role: 'assistant', content: 'A3' },
      ],
      exchanges: 3,
    });

    expect(window).toContain('Lehrkraft: Erste');
    expect(window).toContain('Lehrkraft: Zweite');
    expect(window).toContain('Lehrkraft: Dritte');
  });

  it('keeps only the trailing exchanges', () => {
    const window = buildExtractionWindow({
      messages: [
        { role: 'user', content: 'Alt' },
        { role: 'assistant', content: 'A0' },
        { role: 'user', content: 'Neu' },
        { role: 'assistant', content: 'A1' },
      ],
      exchanges: 1,
    });

    expect(window).not.toContain('Alt');
    expect(window).toContain('Lehrkraft: Neu');
  });

  it('drops tool and system messages', () => {
    const window = buildExtractionWindow({
      messages: [
        { role: 'system', content: 'Systemanweisung' },
        { role: 'user', content: 'Frage' },
        { role: 'tool', content: 'Werkzeugausgabe' },
        { role: 'assistant', content: 'Antwort' },
      ],
    });

    expect(window).toBe('Lehrkraft: Frage\nAssistent: Antwort');
  });

  it('truncates very long messages', () => {
    const window = buildExtractionWindow({
      messages: [{ role: 'user', content: 'a'.repeat(5000) }],
    });

    expect(window.length).toBeLessThan(2000);
  });

  it('returns an empty string when there is nothing usable', () => {
    expect(buildExtractionWindow({ messages: [{ role: 'tool', content: 'x' }] })).toBe('');
  });
});
