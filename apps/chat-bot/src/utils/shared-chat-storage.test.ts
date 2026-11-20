import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/logging', () => ({
  logError: vi.fn(),
}));

import { logError } from '@shared/logging';

import {
  clearSharedChat,
  loadSharedChat,
  type PersistedSharedChat,
  saveSharedChat,
  sharedChatStorageKey,
} from './shared-chat-storage';

/**
 * Minimal in-memory `Storage` for tests. The vitest config uses the `node`
 * environment, so `window` and `sessionStorage` are not provided by jsdom.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }
  clear(): void {
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
    this.store.set(key, value);
  }
}

const INVITE_CODE = 'invite-abc-123';
const SESSION_ID = crypto.randomUUID();

function installSessionStorage(storage: Storage): void {
  (globalThis as { window?: unknown }).window = { sessionStorage: storage };
}

function uninstallSessionStorage(): void {
  delete (globalThis as { window?: unknown }).window;
}

describe('sharedChatStorageKey', () => {
  it('returns a versioned, invite-code-scoped key', () => {
    expect(sharedChatStorageKey(INVITE_CODE)).toBe(`shared-chat:v3:${INVITE_CODE}`);
  });

  it('produces different keys for different invite codes', () => {
    expect(sharedChatStorageKey('a')).not.toBe(sharedChatStorageKey('b'));
  });
});

describe('shared-chat sessionStorage round-trip', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    installSessionStorage(storage);
    vi.mocked(logError).mockClear();
  });

  afterEach(() => {
    uninstallSessionStorage();
  });

  it('returns null when nothing is stored for the invite code', () => {
    expect(loadSharedChat(INVITE_CODE)).toBeNull();
  });

  it('persists and restores only the shared session ID', () => {
    const data: PersistedSharedChat = { sharedSessionId: SESSION_ID };

    saveSharedChat(INVITE_CODE, data);

    expect(loadSharedChat(INVITE_CODE)).toEqual(data);
    expect(storage.getItem(sharedChatStorageKey(INVITE_CODE))).toBe(JSON.stringify(data));
  });

  it('writes to the invite-code-scoped key', () => {
    saveSharedChat(INVITE_CODE, {
      sharedSessionId: SESSION_ID,
    });

    expect(storage.getItem(sharedChatStorageKey(INVITE_CODE))).not.toBeNull();
  });

  it('isolates shared chats between invite codes', () => {
    const sessionA = crypto.randomUUID();
    const sessionB = crypto.randomUUID();
    saveSharedChat('code-a', { sharedSessionId: sessionA });
    saveSharedChat('code-b', { sharedSessionId: sessionB });

    expect(loadSharedChat('code-a')).toEqual({ sharedSessionId: sessionA });
    expect(loadSharedChat('code-b')).toEqual({ sharedSessionId: sessionB });
  });

  it('does not store transcript data', () => {
    saveSharedChat(INVITE_CODE, { sharedSessionId: SESSION_ID });

    expect(storage.getItem(sharedChatStorageKey(INVITE_CODE))).not.toContain('messages');
  });

  it('overwrites previously persisted data on subsequent saves', () => {
    const newSession = crypto.randomUUID();
    saveSharedChat(INVITE_CODE, { sharedSessionId: crypto.randomUUID() });
    saveSharedChat(INVITE_CODE, { sharedSessionId: newSession });

    expect(loadSharedChat(INVITE_CODE)).toEqual({ sharedSessionId: newSession });
  });

  it('clearSharedChat removes the persisted entry', () => {
    saveSharedChat(INVITE_CODE, {
      sharedSessionId: SESSION_ID,
    });
    expect(loadSharedChat(INVITE_CODE)).not.toBeNull();

    clearSharedChat(INVITE_CODE);

    expect(loadSharedChat(INVITE_CODE)).toBeNull();
    expect(storage.getItem(sharedChatStorageKey(INVITE_CODE))).toBeNull();
  });

  it('clearSharedChat is a no-op when nothing is stored', () => {
    expect(() => clearSharedChat(INVITE_CODE)).not.toThrow();
  });
});

describe('loadSharedChat — invalid data', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    installSessionStorage(storage);
    vi.mocked(logError).mockClear();
  });

  afterEach(() => {
    uninstallSessionStorage();
  });

  it('returns null when stored value is not valid JSON', () => {
    storage.setItem(sharedChatStorageKey(INVITE_CODE), 'not json {');

    expect(loadSharedChat(INVITE_CODE)).toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('strips legacy transcript fields from stored JSON', () => {
    storage.setItem(
      sharedChatStorageKey(INVITE_CODE),
      JSON.stringify({
        sharedSessionId: SESSION_ID,
        messages: [{ id: 'm1', role: 'bogus-role', content: 'x' }],
      }),
    );

    expect(loadSharedChat(INVITE_CODE)).toEqual({
      sharedSessionId: SESSION_ID,
    });
  });

  it('returns null when sharedSessionId is missing', () => {
    storage.setItem(
      sharedChatStorageKey(INVITE_CODE),
      JSON.stringify({ messages: [{ id: 'm1', role: 'user', content: 'x' }] }),
    );

    expect(loadSharedChat(INVITE_CODE)).toBeNull();
  });

  it('returns null when sharedSessionId is empty', () => {
    storage.setItem(
      sharedChatStorageKey(INVITE_CODE),
      JSON.stringify({ sharedSessionId: '', messages: [] }),
    );

    expect(loadSharedChat(INVITE_CODE)).toBeNull();
  });

  it('returns null when sharedSessionId is not a uuid', () => {
    storage.setItem(
      sharedChatStorageKey(INVITE_CODE),
      JSON.stringify({ sharedSessionId: 'AbCdEfGhIjKlMnOpQrStUvWx' }),
    );

    expect(loadSharedChat(INVITE_CODE)).toBeNull();
  });

  it('returns null when stored JSON is not an object', () => {
    storage.setItem(sharedChatStorageKey(INVITE_CODE), JSON.stringify([{ id: 'm1' }]));

    expect(loadSharedChat(INVITE_CODE)).toBeNull();
  });
});

describe('shared-chat-storage — storage unavailable', () => {
  afterEach(() => {
    uninstallSessionStorage();
    vi.mocked(logError).mockClear();
  });

  it('load returns null when window is undefined (SSR)', () => {
    uninstallSessionStorage();
    expect(loadSharedChat(INVITE_CODE)).toBeNull();
  });

  it('save is a no-op when window is undefined (SSR)', () => {
    uninstallSessionStorage();
    expect(() =>
      saveSharedChat(INVITE_CODE, {
        sharedSessionId: SESSION_ID,
      }),
    ).not.toThrow();
  });

  it('clear is a no-op when window is undefined (SSR)', () => {
    uninstallSessionStorage();
    expect(() => clearSharedChat(INVITE_CODE)).not.toThrow();
  });

  it('load returns null and logs when getItem throws', () => {
    const throwingStorage: Storage = {
      length: 0,
      clear: () => {},
      getItem: () => {
        throw new Error('storage disabled');
      },
      key: () => null,
      removeItem: () => {},
      setItem: () => {},
    };
    installSessionStorage(throwingStorage);

    expect(loadSharedChat(INVITE_CODE)).toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('save logs and swallows when setItem throws (e.g. quota exceeded)', () => {
    const throwingStorage: Storage = {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    installSessionStorage(throwingStorage);

    expect(() =>
      saveSharedChat(INVITE_CODE, {
        sharedSessionId: SESSION_ID,
      }),
    ).not.toThrow();
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('clear logs and swallows when removeItem throws', () => {
    const throwingStorage: Storage = {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {
        throw new Error('storage disabled');
      },
      setItem: () => {},
    };
    installSessionStorage(throwingStorage);

    expect(() => clearSharedChat(INVITE_CODE)).not.toThrow();
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
