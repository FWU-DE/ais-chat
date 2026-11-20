import { describe, expect, it } from 'vitest';

import { computeBlobHash } from './blob-hash';

describe('computeBlobHash', () => {
  it('should return the same hash for identical content', async () => {
    const blob1 = new Blob(['same content'], { type: 'text/plain' });
    const blob2 = new Blob(['same content'], { type: 'text/plain' });

    const hash1 = await computeBlobHash(blob1);
    const hash2 = await computeBlobHash(blob2);

    expect(hash1).toBe(hash2);
  });

  it('should return different hashes for different content', async () => {
    const blob1 = new Blob(['content A'], { type: 'text/plain' });
    const blob2 = new Blob(['content B'], { type: 'text/plain' });

    const hash1 = await computeBlobHash(blob1);
    const hash2 = await computeBlobHash(blob2);

    expect(hash1).not.toBe(hash2);
  });

  it('should match a known SHA-256 result', async () => {
    // SHA-256("test") = 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
    const expected = '9f86d081884c';
    const blob = new Blob(['test'], { type: 'text/plain' });
    const hash = await computeBlobHash(blob);

    expect(hash).toBe(expected);
  });
});
