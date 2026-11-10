import { describe, expect, it } from 'vitest';

import { isUUID } from './uuid';

describe('isUUID', () => {
  it('should return true for valid UUIDs', () => {
    expect(isUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isUUID('6ba7b810-9dad-41d1-80b4-00c04fd430c8')).toBe(true);
    expect(isUUID('a3bb189e-8bf9-4f0d-b2f5-6b0f3e6c2d5a')).toBe(true);
  });

  it('should return true for valid UUIDs with uppercase letters', () => {
    expect(isUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    expect(isUUID('A3BB189E-8BF9-4F0D-B2F5-6B0F3E6C2D5A')).toBe(true);
  });

  it('should return false for invalid UUID formats', () => {
    expect(isUUID('not-a-uuid')).toBe(false);
    expect(isUUID('550e8400-e29b-41d4-a716')).toBe(false);
    expect(isUUID('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false);
    expect(isUUID('550e8400e29b41d4a716446655440000')).toBe(false);
  });

  it('should return false for empty or invalid strings', () => {
    expect(isUUID('')).toBe(false);
    expect(isUUID('   ')).toBe(false);
    expect(isUUID('550e8400-e29b-41d4-a716-44665544000g')).toBe(false);
  });
});
