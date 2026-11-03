import { logError } from '@shared/logging';
import { z } from 'zod';

const STORAGE_KEY_VERSION = 'v2';

const persistedSharedChatSchema = z.object({
  sharedSessionId: z.string().min(1),
});

export type PersistedSharedChat = z.infer<typeof persistedSharedChatSchema>;

export function sharedChatStorageKey(inviteCode: string): string {
  return `shared-chat:${STORAGE_KEY_VERSION}:${inviteCode}`;
}

/**
 * Creates a new random shared-chat session id. Thin wrapper so callers don't
 * need to special-case SSR / storage availability.
 */
export function newSharedChatSessionId(): string {
  return crypto.randomUUID();
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    // Access can throw in some sandboxed contexts.
    return null;
  }
}

/**
 * Load and validate the persisted shared chat for the given invite code.
 * Returns `null` if nothing is stored, storage is unavailable, or the stored
 * value cannot be parsed.
 */
export function loadSharedChat(inviteCode: string): PersistedSharedChat | null {
  const storage = getSessionStorage();
  if (storage === null) return null;

  try {
    const raw = storage.getItem(sharedChatStorageKey(inviteCode));
    if (raw === null) return null;
    const parsed = JSON.parse(raw ?? '');
    const result = persistedSharedChatSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }
    return null;
  } catch (error) {
    logError('Failed to read shared chat from sessionStorage', error);
    return null;
  }
}

/**
 * Persist the shared session identity for the invite code. Best-effort:
 * failures (quota exceeded, storage disabled) are logged and swallowed so the
 * chat keeps working in-memory.
 */
export function saveSharedChat(inviteCode: string, data: PersistedSharedChat): void {
  const storage = getSessionStorage();
  if (storage === null) return;

  try {
    const parsed = persistedSharedChatSchema.parse(data);
    storage.setItem(sharedChatStorageKey(inviteCode), JSON.stringify(parsed));
  } catch (error) {
    logError('Failed to save shared chat to sessionStorage', error);
  }
}

/**
 * Remove any persisted shared chat state for the invite code.
 */
export function clearSharedChat(inviteCode: string): void {
  const storage = getSessionStorage();
  if (storage === null) return;

  try {
    storage.removeItem(sharedChatStorageKey(inviteCode));
  } catch (error) {
    logError('Failed to clear shared chat from sessionStorage', error);
  }
}
