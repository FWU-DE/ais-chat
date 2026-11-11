import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearSessionStorage,
  readSessionStorage,
  writeSessionStorage,
} from './use-session-storage-state';

/**
 * Minimal in-memory `Storage` for tests. The vitest config uses the `node`
 * environment, so `window` and `sessionStorage` are not provided by jsdom.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  failWrites = false;
  failClear = false;

  get length(): number {
    return this.store.size;
  }
  clear(): void {
    if (this.failClear) {
      throw new Error('clear blocked');
    }
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new Error('quota exceeded');
    }
    this.store.set(key, value);
  }
}

const KEY = 'overview-sort-assistant';

describe('session storage helpers', () => {
  let storage: MemoryStorage;
  let dispatchEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = new MemoryStorage();
    dispatchEvent = vi.fn();
    (globalThis as { window?: unknown }).window = { sessionStorage: storage, dispatchEvent };
    clearSessionStorage();
    dispatchEvent.mockClear();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('round-trips a written value and notifies subscribers', () => {
    writeSessionStorage(KEY, 'name-asc');

    expect(readSessionStorage(KEY)).toBe('name-asc');
    expect(storage.getItem(KEY)).toBe('name-asc');
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('returns the written value from memory when the storage write fails', () => {
    writeSessionStorage(KEY, 'date-desc');
    storage.failWrites = true;
    writeSessionStorage(KEY, 'name-asc');

    expect(readSessionStorage(KEY)).toBe('name-asc');
  });

  it('prefers a later successful write over the memory fallback', () => {
    storage.failWrites = true;
    writeSessionStorage(KEY, 'name-asc');
    storage.failWrites = false;
    writeSessionStorage(KEY, 'popularity');

    expect(readSessionStorage(KEY)).toBe('popularity');
    expect(storage.getItem(KEY)).toBe('popularity');
  });

  describe('clearSessionStorage', () => {
    it('empties the storage and notifies subscribers', () => {
      writeSessionStorage(KEY, 'name-asc');
      dispatchEvent.mockClear();

      clearSessionStorage();

      expect(readSessionStorage(KEY)).toBeNull();
      expect(storage.length).toBe(0);
      expect(dispatchEvent).toHaveBeenCalledTimes(1);
    });

    it('drops values that only exist in the memory fallback', () => {
      storage.failWrites = true;
      writeSessionStorage(KEY, 'name-asc');
      expect(readSessionStorage(KEY)).toBe('name-asc');

      clearSessionStorage();

      expect(readSessionStorage(KEY)).toBeNull();
    });

    it('still drops the memory fallback when clearing the storage throws', () => {
      storage.failWrites = true;
      writeSessionStorage(KEY, 'name-asc');
      storage.failClear = true;

      expect(() => clearSessionStorage()).not.toThrow();
      expect(readSessionStorage(KEY)).toBeNull();
    });
  });
});
