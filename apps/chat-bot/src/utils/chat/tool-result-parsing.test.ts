import { describe, expect, it } from 'vitest';
import { parseJsonRecord, toLinks, truncate } from './tool-result-parsing';

describe('activity helpers', () => {
  it('parses valid JSON and rejects missing, blank, and invalid values', () => {
    expect(parseJsonRecord('{"query":"test"}')).toEqual({ query: 'test' });
    expect(parseJsonRecord(undefined)).toBeUndefined();
    expect(parseJsonRecord('   ')).toBeUndefined();
    expect(parseJsonRecord('{')).toBeUndefined();
  });

  it('normalizes valid links, skips invalid links, and limits the result', () => {
    const links = toLinks([
      { title: 'Example', url: 'https://example.com/path' },
      { url: 'http://example.org' },
      { url: 'javascript:alert(1)' },
      { url: 'not-a-url' },
      { title: 'Empty' },
    ]);

    expect(links).toEqual([
      { title: 'Example', url: 'https://example.com/path' },
      { title: 'http://example.org', url: 'http://example.org/' },
    ]);
    expect(toLinks([])).toBeUndefined();

    const manyLinks = toLinks(
      Array.from({ length: 12 }, (_, index) => ({ url: `https://example.com/${index}` })),
    );
    expect(manyLinks).toHaveLength(10);
  });

  it('marks links as failed when the entry carries an error', () => {
    const links = toLinks([{ url: 'https://example.com', error: 'Invalid URL.' }]);
    expect(links).toEqual([
      { title: 'https://example.com', url: 'https://example.com/', failed: true },
    ]);
  });

  it('truncates long values while preserving short and missing values', () => {
    expect(truncate('short')).toBe('short');
    expect(truncate(undefined)).toBeUndefined();
    expect(truncate('a'.repeat(201))).toBe(`${'a'.repeat(200)}…`);
  });
});
