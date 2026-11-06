import { describe, expect, test } from 'vitest';

import { decrypt, encrypt } from './crypto';

describe('Encryption/Decryption functions', () => {
  const plainText = 'Hello, world!';
  const plainEncryptionKey = 'mySuperSecretKey';

  test('should correctly encrypt and then decrypt the text', () => {
    const encrypted = encrypt({ text: plainText, plainEncryptionKey });
    const decrypted = decrypt({ data: encrypted, plainEncryptionKey });
    expect(decrypted).toBe(plainText);
  });

  test('should throw an error when decryption data is malformed', () => {
    expect(() => decrypt({ data: 'malformed-data-without-colon', plainEncryptionKey })).toThrow(
      'Could not decrypt data',
    );
  });

  test('should throw an error when using the wrong decryption key', () => {
    const encrypted = encrypt({ text: plainText, plainEncryptionKey });
    // Use a different key for decryption
    const wrongKey = 'incorrectKey';
    expect(() => decrypt({ data: encrypted, plainEncryptionKey: wrongKey })).toThrow();
  });

  test('should produce different ciphertexts for the same text and key', () => {
    const encrypted1 = encrypt({ text: plainText, plainEncryptionKey });
    const encrypted2 = encrypt({ text: plainText, plainEncryptionKey });
    expect(encrypted1).not.toBe(encrypted2);
  });

  test('should work with an empty string', () => {
    const emptyText = '';
    const encrypted = encrypt({ text: emptyText, plainEncryptionKey });
    const decrypted = decrypt({ data: encrypted, plainEncryptionKey });
    expect(decrypted).toBe(emptyText);
  });
});
