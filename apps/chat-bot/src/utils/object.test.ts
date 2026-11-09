import { describe, expect, it } from 'vitest';

import { deepCopy, deepEqual } from './object';

describe('deepCopy', () => {
  it('should return the same primitive value', () => {
    expect(deepCopy(5)).toBe(5);
    expect(deepCopy('hello')).toBe('hello');
    expect(deepCopy(true)).toBe(true);
    expect(deepCopy(null)).toBe(null);
    expect(deepCopy(undefined)).toBe(undefined);
  });

  it('should create a deep copy of an array', () => {
    const original = [1, 2, { a: 3 }];
    const copy = deepCopy(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy[2]).not.toBe(original[2]);
  });

  it('should create a deep copy of a nested object', () => {
    const original = { a: 1, b: { c: 2 } };
    const copy = deepCopy(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.b).not.toBe(original.b);
  });

  it('should create a deep copy of a Date object', () => {
    const original = new Date();
    const copy = deepCopy(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.getTime()).toBe(original.getTime());
  });

  it('should create a deep copy of a Map', () => {
    const original = new Map<string, string | object>([
      ['key1', 'value1'],
      ['key2', { nested: 'value2' }],
    ]);
    const copy = deepCopy(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.get('key2')).not.toBe(original.get('key2'));
  });

  it('should create a deep copy of a Set', () => {
    const original = new Set([1, 2, { a: 3 }]);
    const copy = deepCopy(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.has({ a: 3 })).toBe(false); // A new object reference was created in the Set
  });

  it('should create a deep copy of a File object', () => {
    const fileContent = new Blob(['file content'], { type: 'text/plain' });
    const original = new File([fileContent], 'test.txt', {
      type: 'text/plain',
      lastModified: Date.now(),
    });
    const copy = deepCopy(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
    expect(copy.name).toBe(original.name);
    expect(copy.type).toBe(original.type);
    expect(copy.lastModified).toBe(original.lastModified);
  });
});

describe('deepEqual', () => {
  it('should return true for primitive equality', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('hello', 'hello')).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
  });

  it('should return false for primitive inequality', () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('hello', 'world')).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it('should compare arrays deeply', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('should compare objects deeply', () => {
    expect(deepEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('should compare Dates correctly', () => {
    expect(deepEqual(new Date('2023-12-13'), new Date('2023-12-13'))).toBe(true);
    expect(deepEqual(new Date('2023-12-13'), new Date('2022-12-13'))).toBe(false);
  });

  // TODO: fix and add back
  it.skip('should compare Maps correctly', () => {
    const map1 = new Map([
      ['key1', 'value1'],
      ['key2', 'value2'],
    ]);
    const map2 = new Map([
      ['key1', 'value1'],
      ['key2', 'value2'],
    ]);
    expect(deepEqual(map1, map2)).toBe(true);
    const map3 = new Map([['key1', 'value1']]);
    expect(deepEqual(map1, map3)).toBe(false);
  });

  it('should compare Sets correctly', () => {
    const set1 = new Set([1, 2, 3]);
    const set2 = new Set([1, 2, 3]);
    expect(deepEqual(set1, set2)).toBe(true);
    const set3 = new Set([1, 2]);
    expect(deepEqual(set1, set3)).toBe(false);
  });

  it('should compare Files correctly', () => {
    const file1 = new File(['content'], 'file.txt', { type: 'text/plain', lastModified: 1000 });
    const file2 = new File(['content'], 'file.txt', { type: 'text/plain', lastModified: 1000 });
    expect(deepEqual(file1, file2)).toBe(true);
    const file3 = new File(['different'], 'file.txt', { type: 'text/plain', lastModified: 1000 });
    expect(deepEqual(file1, file3)).toBe(false);
  });

  it('should return false for different types', () => {
    // @ts-expect-error this is just for the tests
    expect(deepEqual(1, [1])).toBe(false);
    expect(deepEqual({ a: 1 }, [1])).toBe(false);
  });
});
