import { describe, expect, it } from 'vitest';

import { domainSchema } from './types';

describe('domainSchema', () => {
  it('accepts valid absolute URLs', () => {
    expect(domainSchema.safeParse('http://example.com').success).toBe(true);
    expect(domainSchema.safeParse('https://example.com/path?query=1').success).toBe(true);
    expect(domainSchema.safeParse('www.zeit.de').success).toBe(true);
    expect(domainSchema.safeParse('zeit.de').success).toBe(true);
  });

  it('rejects invalid URLs', () => {
    expect(domainSchema.safeParse('no spaces.com').success).toBe(false);
    expect(domainSchema.safeParse('/relative/path/only').success).toBe(false);
  });
});
