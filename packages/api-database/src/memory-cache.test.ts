import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryCache } from './memory-cache';

describe('Memory Cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return undefined on cache miss', async () => {
    const cache = new MemoryCache({ ex: 1 });
    const result = await cache.get('non-existent-key');
    expect(result).toBeUndefined();
  });

  it('should return the cached value', async () => {
    const cache = new MemoryCache({ ex: 1 });
    const key = 'test-key';
    const value = { name: 'Test' };

    await cache.put(key, value, [], false);
    const result = await cache.get(key);

    expect(result).toEqual(value);
  });

  it.each([
    { ttl: 1, advance: 1100 }, // expired by global ttl
    { ttl: 2, ex: 1, advance: 1100 }, // expired by config with expiry in seconds on item
    { ttl: 2, px: 800, advance: 900 }, // expired by config with expiry in milliseconds on item
  ])(
    'should return undefined when the cached value expired (ttl=$ttl, ex=$ex, px=$px)',
    async (config) => {
      // Set global TTL to 2 seconds
      const cache = new MemoryCache({ ex: config.ttl });
      const key = 'expiring-key';
      const value = { name: 'Expired' };

      // Cache item with optional TTL config
      await cache.put(key, value, [], false, { ex: config.ex, px: config.px });

      // Advance time
      vi.advanceTimersByTime(config.advance);

      const result = await cache.get(key);
      expect(result).toBeUndefined();
    },
  );
});
