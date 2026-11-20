import { describe, expect, it } from 'vitest';

import { generateInviteCode } from './generate-invite-code';

describe('generateInviteCode', () => {
  it('should generate a code with default length of 8', () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(8);
  });

  it('should generate a code with custom length', () => {
    const code = generateInviteCode(12);
    expect(code).toHaveLength(12);
  });

  it('should only contain allowed characters', () => {
    const code = generateInviteCode(200);
    const allowedChars = '123456789ABCDEFGHIJKLMNPQRSTUVWXYZ';

    for (const char of code) {
      expect(allowedChars).toContain(char);
    }
  });

  it('should not contain potentially confusing characters (0, O)', () => {
    const code = generateInviteCode(200);
    const confusingChars = '0O';

    for (const char of confusingChars) {
      expect(code).not.toContain(char);
    }
  });

  it('should generate different codes on consecutive calls', () => {
    const code1 = generateInviteCode();
    const code2 = generateInviteCode();

    expect(code1).not.toBe(code2);
  });

  it('should return uppercase characters', () => {
    const code = generateInviteCode(200);
    expect(code).toBe(code.toUpperCase());
  });
});
