import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/logging', () => ({
  logError: vi.fn(),
}));

import { logError } from '@shared/logging';
import {
  clearSharedChat,
  loadSharedChat,
  saveSharedChat,
  sharedChatStorageKey,
  type PersistedSharedChat,
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

function installSessionStorage(storage: Storage): void {
  (globalThis as { window?: unknown }).window = { sessionStorage: storage };
}

function uninstallSessionStorage(): void {
  delete (globalThis as { window?: unknown }).window;
}

const persistedFile = {
  id: 'file-1',
  name: 'test.png',
  type: 'png',
  size: 123,
};

describe('sharedChatStorageKey', () => {
  it('returns a versioned, invite-code-scoped key', () => {
    expect(sharedChatStorageKey(INVITE_CODE)).toBe(`shared-chat:v2:${INVITE_CODE}`);
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

  it('persists and restores a simple shared chat', () => {
    const data: PersistedSharedChat = {
      sharedSessionId: 'session-1',
      messages: [
        { id: 'm1', role: 'user', content: 'Hello', files: [] },
        { id: 'm2', role: 'assistant', content: 'Hi there', files: [] },
      ],
    };

    saveSharedChat(INVITE_CODE, data);

    expect(loadSharedChat(INVITE_CODE)).toEqual(data);
  });

  it('persists and restores files attached to a message', () => {
    const data: PersistedSharedChat = {
      sharedSessionId: 'session-1',
      messages: [{ id: 'm1', role: 'user', content: 'Hello', files: [persistedFile] }],
    };

    saveSharedChat(INVITE_CODE, data);

    expect(loadSharedChat(INVITE_CODE)).toEqual(data);
  });

  it('persists and restores agent loop tool-call and tool-result fields', () => {
    const data: PersistedSharedChat = {
      sharedSessionId: 'session-1',
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'tool-call-1', name: 'web_search', arguments: '{"query":"test"}' }],
          files: [],
        },
        {
          id: 'm2',
          role: 'tool',
          content: '{"results":[]}',
          toolCallId: 'tool-call-1',
          files: [],
        },
      ],
    };

    saveSharedChat(INVITE_CODE, data);

    expect(loadSharedChat(INVITE_CODE)).toEqual(data);
  });

  it('defaults files to an empty array when not provided', () => {
    storage.setItem(
      sharedChatStorageKey(INVITE_CODE),
      JSON.stringify({
        sharedSessionId: 'session-1',
        messages: [{ id: 'm1', role: 'user', content: 'Hello' }],
      }),
    );

    expect(loadSharedChat(INVITE_CODE)).toEqual({
      sharedSessionId: 'session-1',
      messages: [{ id: 'm1', role: 'user', content: 'Hello', files: [] }],
    });
  });

  it('writes to the invite-code-scoped key', () => {
    saveSharedChat(INVITE_CODE, {
      sharedSessionId: 'session-1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', files: [] }],
    });

    expect(storage.getItem(sharedChatStorageKey(INVITE_CODE))).not.toBeNull();
  });

  it('isolates shared chats between invite codes', () => {
    saveSharedChat('code-a', {
      sharedSessionId: 'session-a',
      messages: [{ id: 'a1', role: 'user', content: 'A', files: [] }],
    });
    saveSharedChat('code-b', {
      sharedSessionId: 'session-b',
      messages: [{ id: 'b1', role: 'user', content: 'B', files: [] }],
    });

    expect(loadSharedChat('code-a')?.messages).toEqual([
      { id: 'a1', role: 'user', content: 'A', files: [] },
    ]);
    expect(loadSharedChat('code-b')?.messages).toEqual([
      { id: 'b1', role: 'user', content: 'B', files: [] },
    ]);
  });

  it('strips extra ChatMessage fields that are not part of the persisted shape', () => {
    saveSharedChat(INVITE_CODE, {
      sharedSessionId: 'session-1',
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          content: 'with extras',
          files: [],
          // @ts-expect-error - extra fields should be stripped, not part of the persisted type
          attachments: [
            { type: 'image', contentType: 'image/png', url: 'data:image/png;base64,xx' },
          ],
        },
      ],
    });

    expect(loadSharedChat(INVITE_CODE)).toEqual({
      sharedSessionId: 'session-1',
      messages: [{ id: 'm1', role: 'assistant', content: 'with extras', files: [] }],
    });
  });

  it('overwrites previously persisted data on subsequent saves', () => {
    saveSharedChat(INVITE_CODE, {
      sharedSessionId: 'session-1',
      messages: [{ id: 'old', role: 'user', content: 'old', files: [] }],
    });
    saveSharedChat(INVITE_CODE, {
      sharedSessionId: 'session-1',
      messages: [{ id: 'new', role: 'user', content: 'new', files: [] }],
    });

    expect(loadSharedChat(INVITE_CODE)?.messages).toEqual([
      { id: 'new', role: 'user', content: 'new', files: [] },
    ]);
  });

  it('supports persisting an empty message array (e.g. after Start over)', () => {
    saveSharedChat(INVITE_CODE, { sharedSessionId: 'session-1', messages: [] });

    expect(loadSharedChat(INVITE_CODE)).toEqual({ sharedSessionId: 'session-1', messages: [] });
  });

  it('clearSharedChat removes the persisted entry', () => {
    saveSharedChat(INVITE_CODE, {
      sharedSessionId: 'session-1',
      messages: [{ id: 'm1', role: 'user', content: 'hi', files: [] }],
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

  it('returns null when stored JSON does not match the schema', () => {
    storage.setItem(
      sharedChatStorageKey(INVITE_CODE),
      JSON.stringify({
        sharedSessionId: 'session-1',
        messages: [{ id: 'm1', role: 'bogus-role', content: 'x' }],
      }),
    );

    expect(loadSharedChat(INVITE_CODE)).toBeNull();
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

  it('returns null when stored JSON is not an object', () => {
    storage.setItem(sharedChatStorageKey(INVITE_CODE), JSON.stringify([{ id: 'm1' }]));

    expect(loadSharedChat(INVITE_CODE)).toBeNull();
  });

  it('returns null when a message is missing required fields', () => {
    storage.setItem(
      sharedChatStorageKey(INVITE_CODE),
      JSON.stringify({
        sharedSessionId: 'session-1',
        messages: [{ id: 'm1', role: 'user' }], // missing content
      }),
    );

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
        sharedSessionId: 'session-1',
        messages: [{ id: 'm1', role: 'user', content: 'hi', files: [] }],
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
        sharedSessionId: 'session-1',
        messages: [{ id: 'm1', role: 'user', content: 'hi', files: [] }],
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
